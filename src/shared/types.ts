export type MaybePromise<T> = T | Promise<T>;
export type MaybeArray<T> = T | T[];

export type FrontmatterValue =
	| string
	| number
	| boolean
	| null
	| FrontmatterValue[]
	| { [key: string]: FrontmatterValue };

export type PlaindownInclude =
	| MaybeArray<string>
	| ((ctx: PlaindownPluginContext) => MaybePromise<MaybeArray<string>>);

export interface PlaindownPluginContext {
	root: string;
	command: "serve" | "build";
	mode: string;
}

export interface PlaindownFileContext {
	sourcePath: string;
	absolutePath: string;

	route: string;
	dir: string;
	slug: string;
	ext: string;
	isIndex: boolean;

	frontmatter: Record<string, FrontmatterValue>;
}

export interface PlaindownOptions {
	/**
	 * Enable or disable the plugin.
	 * Defaults to true.
	 */
	enabled?: boolean;

	/**
	 * Controls whether to emit static Markdown/HTML files to the build output.
	 *
	 * When true (default): Files are emitted to disk and served as static assets.
	 * When false: No files are emitted. Content is bundled in JS for runtime access.
	 *
	 * Use emit: false when you only need programmatic access via usePlaindown()
	 * but don't want public /blog/post.md URLs.
	 *
	 * Note: emit: false increases bundle size as content is included in JavaScript.
	 */
	emit?: boolean;

	include?: PlaindownInclude;

	/**
	 * Additional glob patterns to exclude from processing.
	 * These patterns extend (not replace) the default exclusions:
	 * - node_modules, .vitepress, dist, build directories
	 * - Your Vite build.outDir (automatically detected)
	 */
	exclude?: MaybeArray<string>;

	/**
	 * Controls the public URL where the Markdown file is served/emitted.
	 *
	 * Example:
	 * sourcePath: blog/my-post.md
	 * route: /blog/my-post
	 *
	 * format: ({ route }) => `${route}.md`
	 * output: /blog/my-post.md
	 */
	format?: (ctx: PlaindownFileContext) => string;

	/**
	 * Controls how runtime callers refer to this Markdown file.
	 *
	 * Defaults to sourcePath.
	 */
	identifier?: (ctx: PlaindownFileContext) => string;

	/**
	 * If true, emitted/served Markdown has frontmatter removed.
	 */
	stripFrontmatter?: boolean;

	/**
	 * Experimental features (unstable, may change in future versions).
	 */
	experimental?: {
		/**
		 * Custom chunking strategy for emit: false mode.
		 *
		 * Split large bundles (500+ files) into multiple chunks.
		 * Return chunk name (string) or undefined for default chunk.
		 *
		 * Examples:
		 * - chunks: (entry) => entry.dir  // Chunk by directory
		 * - chunks: (entry) => entry.frontmatter.category  // Chunk by frontmatter
		 *
		 * Each chunk becomes a separate lazy-loaded bundle.
		 */
		chunks?: (entry: PlaindownManifestEntry) => MaybePromise<string | null | undefined>;
	};
}

export interface ResolvedPlaindownOptions {
	emit: boolean;
	include: PlaindownInclude;
	exclude: string[];
	format: (ctx: PlaindownFileContext) => string;
	identifier: (ctx: PlaindownFileContext) => string;
	stripFrontmatter: boolean;
	experimental?: {
		chunks?: (entry: PlaindownManifestEntry) => MaybePromise<string | null | undefined>;
	};
}

export interface PlaindownManifestEntry {
	id: string;
	sourcePath: string;
	absolutePath: string;
	url: string;
	frontmatter?: Record<string, FrontmatterValue>;

	// File context fields
	route: string;
	dir: string;
	slug: string;
	ext: string;
	isIndex: boolean;
}

export interface PlaindownManifest {
	entries: Record<string, PlaindownManifestEntry>;
	ids: Record<string, string>;
	config: {
		emit: boolean;
		chunks?: Record<string, string>; // id -> chunkName mapping
	};
}
