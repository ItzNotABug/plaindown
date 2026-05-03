import path from "node:path";
import { Glob } from "bun";
import type { ResolvedConfig } from "vite";
import type {
	FrontmatterValue,
	MaybeArray,
	PlaindownInclude,
	PlaindownManifest,
	PlaindownPluginContext,
	ResolvedPlaindownOptions,
} from "../shared/types";
import { validateNonEmptyString } from "../shared/validation.js";
import {
	createRouteParts,
	normalizePublicUrl,
	normalizeSourcePath,
	parseFrontmatter,
} from "./transform.js";
import { concurrent } from "./utils.js";

function toArray<T>(value: MaybeArray<T>): T[] {
	return Array.isArray(value) ? value : [value];
}

async function resolveInclude(include: PlaindownInclude, ctx: PlaindownPluginContext) {
	const resolved = typeof include === "function" ? await include(ctx) : include;
	return toArray(resolved);
}

async function scanFiles(
	patterns: string[],
	excludePatterns: string[],
	cwd: string,
): Promise<string[]> {
	const allFiles = new Set<string>();

	// Collect all matching files from include patterns
	for (const pattern of patterns) {
		const glob = new Glob(pattern);
		for await (const file of glob.scan({ cwd, onlyFiles: true, dot: true })) {
			allFiles.add(file);
		}
	}

	// Remove excluded files
	if (excludePatterns.length > 0) {
		const filesToRemove = new Set<string>();

		for (const excludePattern of excludePatterns) {
			const excludeGlob = new Glob(excludePattern);
			for (const file of allFiles) {
				if (excludeGlob.match(file)) {
					filesToRemove.add(file);
				}
			}
		}

		for (const file of filesToRemove) {
			allFiles.delete(file);
		}
	}

	return Array.from(allFiles);
}

export async function createPlaindownManifest(
	config: ResolvedConfig,
	options: ResolvedPlaindownOptions,
): Promise<PlaindownManifest> {
	const pluginContext: PlaindownPluginContext = {
		root: config.root,
		command: config.command,
		mode: config.mode,
	};

	const include = await resolveInclude(options.include, pluginContext);

	const outDir = path.isAbsolute(config.build.outDir)
		? path.relative(config.root, config.build.outDir)
		: config.build.outDir;

	// Only exclude if outDir is within project root (doesn't start with ..)
	const exclude = outDir.startsWith("..")
		? toArray(options.exclude)
		: [...toArray(options.exclude), `**/${outDir}/**`];

	const files = await scanFiles(include, exclude, config.root);

	const fileData = await concurrent(
		files.map((file) => async () => {
			const sourcePath = normalizeSourcePath(file);
			const absolutePath = path.resolve(config.root, sourcePath);
			const bunFile = Bun.file(absolutePath);
			const raw = await bunFile.text();
			const parsed = parseFrontmatter(raw);

			return {
				sourcePath,
				absolutePath,
				...createRouteParts(sourcePath),
				frontmatter: parsed.data as Record<string, FrontmatterValue>,
			};
		}),
		50,
	);

	const manifest: PlaindownManifest = {
		entries: {},
		ids: {},
		config: {
			emit: options.emit,
		},
	};

	const seenIds = new Map<string, string>();
	const seenUrls = new Map<string, string>();

	for (const ctx of fileData) {
		const id = options.identifier(ctx);
		const formatResult = options.format(ctx);

		validateNonEmptyString(id, "identifier", ctx.sourcePath);
		validateNonEmptyString(formatResult, "format", ctx.sourcePath);

		const url = normalizePublicUrl(formatResult);

		// Check for identifier collision
		const existingId = seenIds.get(id);

		if (existingId) {
			throw new Error(
				[
					`Plaindown identifier collision: "${id}"`,
					"",
					`- ${existingId}`,
					`- ${ctx.sourcePath}`,
					"",
					"Use a more specific identifier, e.g. ({ sourcePath }) => sourcePath.",
				].join("\n"),
			);
		}

		// Check for URL collision
		const existingUrl = seenUrls.get(url);

		if (existingUrl) {
			throw new Error(
				[
					`Plaindown URL collision: "${url}"`,
					"",
					`- ${existingUrl}`,
					`- ${ctx.sourcePath}`,
					"",
					"Use a more specific format function to ensure unique URLs.",
				].join("\n"),
			);
		}

		seenIds.set(id, ctx.sourcePath);
		seenUrls.set(url, ctx.sourcePath);

		manifest.entries[ctx.sourcePath] = {
			id,
			sourcePath: ctx.sourcePath,
			absolutePath: ctx.absolutePath,
			url,
			route: ctx.route,
			dir: ctx.dir,
			slug: ctx.slug,
			ext: ctx.ext,
			isIndex: ctx.isIndex,
			frontmatter: ctx.frontmatter,
		};

		manifest.ids[id] = ctx.sourcePath;
	}

	return manifest;
}
