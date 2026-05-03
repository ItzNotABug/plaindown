import type { Plugin, ResolvedConfig } from "vite";
import type {
	MaybePromise,
	PlaindownManifest,
	PlaindownManifestEntry,
	PlaindownOptions,
	ResolvedPlaindownOptions,
} from "../shared/types";
import { validateNonEmptyString } from "../shared/validation.js";
import { emitPlaindownFiles } from "./emit.js";
import * as Logger from "./logger.js";
import { createPlaindownManifest } from "./manifest.js";
import { createPlaindownMiddleware } from "./server.js";
import { concurrent, ensureBunRuntime, loadFileContent, resolvePlaindownOptions } from "./utils.js";

const virtualModuleId = "virtual:plaindown";
const resolvedVirtualModuleId = "\0virtual:plaindown";
const virtualContentModuleId = "virtual:plaindown/content";
const resolvedVirtualContentModuleId = "\0virtual:plaindown/content";

/**
 * Efficiently check if manifest changed by comparing keys and entries.
 * Much faster than JSON.stringify for large manifests.
 */
function manifestChanged(old: PlaindownManifest, current: PlaindownManifest): boolean {
	const oldKeys = Object.keys(old.entries);
	const newKeys = Object.keys(current.entries);

	if (oldKeys.length !== newKeys.length) {
		return true;
	}

	for (const key of oldKeys) {
		const oldEntry = old.entries[key];
		const newEntry = current.entries[key];

		if (!newEntry || oldEntry.url !== newEntry.url || oldEntry.id !== newEntry.id) {
			return true;
		}
	}

	return false;
}

/**
 * Build chunk mapping from manifest entries using the chunks function.
 * Validates chunk names and returns the mapping.
 */
async function buildChunkMapping(
	manifest: PlaindownManifest,
	chunksFn: (entry: PlaindownManifestEntry) => MaybePromise<string | null | undefined>,
): Promise<Record<string, string>> {
	const chunkMapping: Record<string, string> = {};
	const entries = Object.values(manifest.entries);

	const results = await concurrent(
		entries.map((entry) => async () => {
			const chunkResult = await chunksFn(entry);
			const chunkName = chunkResult ?? "_default";

			validateNonEmptyString(chunkName, "experimental.chunks", entry.sourcePath);

			return { id: entry.id, chunkName };
		}),
		50,
	);

	for (const { id, chunkName } of results) {
		chunkMapping[id] = chunkName;
	}

	return chunkMapping;
}

/**
 * Create a client-safe version of the manifest by removing sensitive fields.
 */
function createClientManifest(manifest: PlaindownManifest) {
	const clientManifest: {
		entries: Record<string, { id: string; sourcePath: string; url: string }>;
		ids: Record<string, string>;
		config: { emit: boolean; chunks?: Record<string, string> };
	} = {
		entries: {},
		ids: manifest.ids,
		config: manifest.config,
	};

	for (const [key, entry] of Object.entries(manifest.entries)) {
		clientManifest.entries[key] = {
			id: entry.id,
			sourcePath: entry.sourcePath,
			url: entry.url,
		};
	}

	return clientManifest;
}

/**
 * Generate content map for virtual:plaindown/content module.
 * Only used when emit: false.
 */
async function generateContentMap(
	manifest: PlaindownManifest,
	options: ResolvedPlaindownOptions,
): Promise<Record<string, string>> {
	const contentMap: Record<string, string> = {};

	const entries = Object.values(manifest.entries);
	const contents = await concurrent(
		entries.map((entry) => async () => {
			const content = await loadFileContent(entry.absolutePath, options.stripFrontmatter);
			return { id: entry.id, content };
		}),
		50,
	);

	for (const { id, content } of contents) {
		contentMap[id] = content;
	}

	return contentMap;
}

/**
 * Generate chunk-specific content maps when experimental.chunks is enabled.
 * Returns a map of chunkName -> contentMap.
 */
async function generateChunkedContentMaps(
	manifest: PlaindownManifest,
	options: ResolvedPlaindownOptions,
): Promise<Record<string, Record<string, string>>> {
	const chunks: Record<string, Record<string, string>> = {};

	const chunkMapping = manifest.config.chunks;
	if (!chunkMapping) {
		return chunks;
	}

	const entries = Object.values(manifest.entries);
	const contents = await concurrent(
		entries.map((entry) => async () => {
			const content = await loadFileContent(entry.absolutePath, options.stripFrontmatter);
			const chunkName = chunkMapping[entry.id];
			return { id: entry.id, content, chunkName };
		}),
		50,
	);

	for (const { id, content, chunkName } of contents) {
		if (!chunks[chunkName]) {
			chunks[chunkName] = {};
		}
		chunks[chunkName][id] = content;
	}

	return chunks;
}

export function plaindown(userOptions: PlaindownOptions = {}): Plugin {
	ensureBunRuntime();

	if (userOptions.enabled === false) {
		return {
			name: "plaindown",
			apply: () => false,
		};
	}

	let config: ResolvedConfig;
	let options: ResolvedPlaindownOptions;
	let manifest: PlaindownManifest = {
		entries: {},
		ids: {},
		config: {
			emit: true,
		},
	};
	let chunkedContentCache: Record<string, Record<string, string>> | null = null;

	let cachedFileCount = 0;
	let cachedChunkCount = 0;
	let hasLoggedBuild = false;
	let hasLoggedEmit = false;

	return {
		name: "plaindown",

		config() {
			return {
				optimizeDeps: {
					exclude: ["@itznotabug/plaindown"],
				},
				ssr: {
					noExternal: ["@itznotabug/plaindown"],
				},
			};
		},

		async configResolved(resolvedConfig) {
			config = resolvedConfig;
			options = resolvePlaindownOptions(userOptions);
			manifest = await createPlaindownManifest(config, options);

			cachedFileCount = Object.keys(manifest.entries).length;

			if (options.experimental?.chunks && !options.emit) {
				const chunkMapping = await buildChunkMapping(manifest, options.experimental.chunks);
				manifest.config.chunks = chunkMapping;
				chunkedContentCache = await generateChunkedContentMaps(manifest, options);
				cachedChunkCount = new Set(Object.values(chunkMapping)).size;
			}

			if (config.command === "build") {
				Logger.startQueuing();
			}
		},

		renderStart() {
			if (config.command === "build" && !hasLoggedBuild) {
				hasLoggedBuild = true;
				if (options.experimental?.chunks && !options.emit) {
					Logger.success(
						`indexed ${cachedFileCount} markdown ${cachedFileCount === 1 ? "entry" : "entries"} (${cachedChunkCount} ${cachedChunkCount === 1 ? "chunk" : "chunks"})`,
					);
				} else {
					Logger.success(
						`indexed ${cachedFileCount} markdown ${cachedFileCount === 1 ? "entry" : "entries"}`,
					);
				}
			}
		},

		resolveId(id) {
			if (id === virtualModuleId) {
				return resolvedVirtualModuleId;
			}
			if (id === virtualContentModuleId) {
				return resolvedVirtualContentModuleId;
			}
			if (id.startsWith(`${virtualContentModuleId}/`)) {
				return `\0${id}`;
			}
		},

		async load(id) {
			if (id === resolvedVirtualModuleId) {
				const clientManifest = createClientManifest(manifest);

				if (clientManifest.config.chunks) {
					const chunkNames = new Set(Object.values(clientManifest.config.chunks));
					const chunkImports = Array.from(chunkNames)
						.map((name, i) => `import * as chunk${i} from "virtual:plaindown/content/${name}";`)
						.join("\n");

					const chunkMap = Array.from(chunkNames)
						.map((name, i) => `  "${name}": chunk${i}.contentMap`)
						.join(",\n");

					return `${chunkImports}

export const plaindownManifest = ${JSON.stringify(clientManifest, null, 2)};

export const chunks = {
${chunkMap}
};`;
				}

				return `export const plaindownManifest = ${JSON.stringify(clientManifest, null, 2)};
export const chunks = undefined;`;
			}

			if (id === resolvedVirtualContentModuleId) {
				if (!options.emit) {
					if (options.experimental?.chunks) {
						return `export const contentMap = {};`;
					}

					const contentMap = await generateContentMap(manifest, options);
					const code = `export const contentMap = ${JSON.stringify(contentMap)};`;

					const bundleSize = code.length;
					const bundleSizeKB = (bundleSize / 1024).toFixed(2);

					if (bundleSize > 512000) {
						Logger.warn(
							`Large bundle: ${bundleSizeKB}KB (consider emit: true or experimental.chunks)`,
						);
					}

					return code;
				}

				return `export const contentMap = {};`;
			}

			if (id.startsWith("\0virtual:plaindown/content/")) {
				const chunkName = id.replace("\0virtual:plaindown/content/", "");
				if (!chunkedContentCache) {
					chunkedContentCache = await generateChunkedContentMaps(manifest, options);
				}
				const chunks = chunkedContentCache;
				const chunkContent = chunks[chunkName] ?? {};

				return `export const contentMap = ${JSON.stringify(chunkContent)};`;
			}
		},

		configureServer(server) {
			if (options.experimental?.chunks && !options.emit) {
				Logger.success(
					`indexed ${cachedFileCount} markdown ${cachedFileCount === 1 ? "entry" : "entries"} (${cachedChunkCount} ${cachedChunkCount === 1 ? "chunk" : "chunks"})`,
				);
			} else {
				Logger.success(
					`indexed ${cachedFileCount} markdown ${cachedFileCount === 1 ? "entry" : "entries"}`,
				);
			}

			server.middlewares.use(createPlaindownMiddleware(config, () => manifest, options));
		},

		async handleHotUpdate({ file, server }) {
			if (file.endsWith(".md")) {
				const oldManifest = manifest;
				manifest = await createPlaindownManifest(config, options);

				let chunkMappingChanged = false;
				if (options.experimental?.chunks && !options.emit) {
					const chunkMapping = await buildChunkMapping(manifest, options.experimental.chunks);
					manifest.config.chunks = chunkMapping;

					const oldChunks = oldManifest.config.chunks || {};
					if (Object.keys(chunkMapping).length !== Object.keys(oldChunks).length) {
						chunkMappingChanged = true;
					} else {
						for (const [id, chunkName] of Object.entries(chunkMapping)) {
							if (oldChunks[id] !== chunkName) {
								chunkMappingChanged = true;
								break;
							}
						}
					}
				}

				const structureChanged = manifestChanged(oldManifest, manifest);

				if (structureChanged || chunkMappingChanged) {
					const mod = server.moduleGraph.getModuleById(resolvedVirtualModuleId);
					if (mod) {
						server.moduleGraph.invalidateModule(mod);
					}
				}

				if (!options.emit) {
					chunkedContentCache = null;

					const contentMod = server.moduleGraph.getModuleById(resolvedVirtualContentModuleId);
					if (contentMod) {
						server.moduleGraph.invalidateModule(contentMod);
					}

					if (options.experimental?.chunks && manifest.config.chunks) {
						const chunkNames = new Set(Object.values(manifest.config.chunks));
						for (const chunkName of chunkNames) {
							const chunkMod = server.moduleGraph.getModuleById(
								`\0virtual:plaindown/content/${chunkName}`,
							);
							if (chunkMod) {
								server.moduleGraph.invalidateModule(chunkMod);
							}
						}
					}
				}

				if (structureChanged || chunkMappingChanged) {
					server.ws.send({
						type: "full-reload",
						path: "*",
					});
				}
			}
		},

		async writeBundle() {
			await emitPlaindownFiles(config, manifest, options, hasLoggedEmit);
			hasLoggedEmit = true;

			if (config.command === "build") {
				Logger.flushQueue();
			}
		},
	};
}

export type {
	PlaindownFileContext,
	PlaindownManifest,
	PlaindownManifestEntry,
	PlaindownOptions,
} from "../shared/types";
