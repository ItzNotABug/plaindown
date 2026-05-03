declare module "virtual:plaindown" {
	export interface PlaindownManifestEntry {
		id: string;
		sourcePath: string;
		url: string;
	}

	export interface PlaindownManifest {
		entries: Record<string, PlaindownManifestEntry>;
		ids: Record<string, string>;
		config: {
			emit: boolean;
			chunks?: Record<string, string>;
		};
	}

	export const plaindownManifest: PlaindownManifest;

	/**
	 * Static map of chunk names to their content maps.
	 * Only populated when experimental.chunks is enabled.
	 */
	export const chunks: Record<string, Record<string, string>> | undefined;
}

declare module "virtual:plaindown/content" {
	/**
	 * Map of file identifiers to their Markdown content.
	 * Only populated when emit: false in plugin config.
	 *
	 * Key: identifier from identifier() function (default: sourcePath)
	 * Value: Markdown content (with frontmatter stripped if configured)
	 */
	export const contentMap: Record<string, string>;
}

declare module "virtual:plaindown/content/*" {
	/**
	 * Chunk-specific content map.
	 * Only populated when experimental.chunks is enabled.
	 */
	export const contentMap: Record<string, string>;
}
