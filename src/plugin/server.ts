import { readFile, stat } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import type { Connect, ResolvedConfig } from "vite";
import type {
	PlaindownManifest,
	PlaindownManifestEntry,
	ResolvedPlaindownOptions,
} from "../shared/types";
import { parseFrontmatter } from "./transform.js";

interface CacheEntry {
	content: string;
	mtime: number;
}

function stripBase(url: string, base: string) {
	if (!base || base === "/") {
		return url;
	}

	return url.startsWith(base) ? `/${url.slice(base.length)}` : url;
}

export function createPlaindownMiddleware(
	config: ResolvedConfig,
	getManifest: () => PlaindownManifest,
	options: ResolvedPlaindownOptions,
) {
	// Caches for dev performance
	const fileCache = new Map<string, CacheEntry>();
	let cachedManifest: PlaindownManifest | null = null;
	let cachedUrlMap: Map<string, PlaindownManifestEntry> | null = null;

	return async function plaindownMiddleware(
		req: Connect.IncomingMessage,
		res: ServerResponse,
		next: Connect.NextFunction,
	): Promise<void> {
		try {
			const fullUrl = req.url ?? "";
			const [requestUrl, queryString] = fullUrl.split("?");

			// Skip Vite module imports (check for ?import or &import)
			if (queryString && /[?&]import(?:&|$|=)/.test(`?${queryString}`)) {
				return next();
			}

			const normalizedUrl = stripBase(requestUrl, config.base);

			// Get manifest and rebuild URL map only if manifest changed
			const manifest = getManifest();
			if (manifest !== cachedManifest) {
				cachedManifest = manifest;
				cachedUrlMap = new Map();
				for (const entry of Object.values(manifest.entries)) {
					cachedUrlMap.set(entry.url, entry);
				}
			}

			const entry = cachedUrlMap?.get(normalizedUrl);

			if (!entry) {
				return next();
			}

			// Respect emit: false in dev mode for dev/prod consistency
			// When emit: false, user doesn't want public URLs
			if (!options.emit) {
				if (config.logLevel === "info") {
					config.logger.info(
						`Plaindown: skipping ${normalizedUrl} (emit: false - use plain.load() for programmatic access)`,
					);
				}
				return next();
			}

			// Check cache
			let content: string;
			const cached = fileCache.get(entry.absolutePath);

			if (cached) {
				// Validate cache by checking mtime
				const stats = await stat(entry.absolutePath);
				const currentMtime = stats.mtimeMs;

				if (cached.mtime === currentMtime) {
					content = cached.content;
				} else {
					// Cache stale, reload
					content = await readFile(entry.absolutePath, "utf8");

					if (options.stripFrontmatter) {
						content = parseFrontmatter(content).content.trimStart();
					}

					fileCache.set(entry.absolutePath, {
						content,
						mtime: currentMtime,
					});
				}
			} else {
				// Not cached, load and cache
				const raw = await readFile(entry.absolutePath, "utf8");

				if (options.stripFrontmatter) {
					content = parseFrontmatter(raw).content.trimStart();
				} else {
					content = raw;
				}

				const stats = await stat(entry.absolutePath);
				fileCache.set(entry.absolutePath, {
					content,
					mtime: stats.mtimeMs,
				});
			}

			res.statusCode = 200;
			res.setHeader("Content-Type", "text/markdown; charset=utf-8");
			res.end(content);
		} catch (error) {
			next(error);
		}
	};
}
