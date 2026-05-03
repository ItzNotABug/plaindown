import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { plaindown } from "../src/plugin";
import type { PlaindownManifestEntry, PlaindownOptions } from "../src/shared/types";
import { configResolved, createMockConfig, load } from "./test-utils";

describe("experimental.chunks", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await mkdtemp(path.join(tmpdir(), "plaindown-chunks-"));
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	it("groups entries by chunk name", async () => {
		// Create test files in different directories
		await writeFile(path.join(testDir, "blog-post.md"), "---\ncategory: blog\n---\n# Blog");
		await writeFile(path.join(testDir, "docs-page.md"), "---\ncategory: docs\n---\n# Docs");
		await writeFile(
			path.join(testDir, "blog-another.md"),
			"---\ncategory: blog\n---\n# Another Blog",
		);

		const options: PlaindownOptions = {
			emit: false,
			include: ["**/*.md"],
			experimental: {
				chunks: (entry) => entry.frontmatter?.category as string,
			},
		};

		const plugin = plaindown(options);
		const config = createMockConfig(testDir);

		await configResolved(plugin, config);

		// Load the manifest
		const manifestCode = (await load(plugin, "\0virtual:plaindown")) as string;
		expect(manifestCode).toContain("plaindownManifest");

		// Parse manifest - extract JSON from the generated code
		const manifestMatch = manifestCode?.match(/export const plaindownManifest = ({[\s\S]*?});/);
		expect(manifestMatch).toBeDefined();
		const manifest = JSON.parse(manifestMatch?.[1]);

		// Check chunk mappings
		expect(manifest.config.chunks).toBeDefined();
		expect(manifest.config.chunks["blog-post.md"]).toBe("blog");
		expect(manifest.config.chunks["docs-page.md"]).toBe("docs");
		expect(manifest.config.chunks["blog-another.md"]).toBe("blog");
	});

	it("uses 'default' chunk for undefined/null returns", async () => {
		await writeFile(path.join(testDir, "no-category.md"), "# No Category");
		await writeFile(
			path.join(testDir, "with-category.md"),
			"---\ncategory: blog\n---\n# With Category",
		);

		const options: PlaindownOptions = {
			emit: false,
			include: ["**/*.md"],
			experimental: {
				chunks: (entry) => entry.frontmatter?.category as string | undefined,
			},
		};

		const plugin = plaindown(options);
		const config = createMockConfig(testDir);

		await configResolved(plugin, config);

		const manifestCode = (await load(plugin, "\0virtual:plaindown")) as string;
		const manifestMatch = manifestCode?.match(/export const plaindownManifest = ({[\s\S]*?});/);
		expect(manifestMatch).toBeDefined();
		const manifest = JSON.parse(manifestMatch?.[1]);

		expect(manifest.config.chunks["no-category.md"]).toBe("_default");
		expect(manifest.config.chunks["with-category.md"]).toBe("blog");
	});

	it("generates chunk-specific virtual modules", async () => {
		await writeFile(path.join(testDir, "blog.md"), "---\ncategory: blog\n---\n# Blog");
		await writeFile(path.join(testDir, "docs.md"), "---\ncategory: docs\n---\n# Docs");

		const options: PlaindownOptions = {
			emit: false,
			include: ["**/*.md"],
			experimental: {
				chunks: (entry) => entry.frontmatter?.category as string,
			},
		};

		const plugin = plaindown(options);
		const config = createMockConfig(testDir);

		await configResolved(plugin, config);

		// Load blog chunk (this implicitly tests that resolveId works)
		const blogChunkCode = (await load(plugin, "\0virtual:plaindown/content/blog")) as string;
		expect(blogChunkCode).toContain("contentMap");

		const blogChunk = JSON.parse(
			blogChunkCode?.replace("export const contentMap = ", "").replace(/;$/, ""),
		);
		expect(blogChunk["blog.md"]).toContain("# Blog");
		expect(blogChunk["docs.md"]).toBeUndefined();

		// Load docs chunk
		const docsChunkCode = (await load(plugin, "\0virtual:plaindown/content/docs")) as string;
		const docsChunk = JSON.parse(
			docsChunkCode?.replace("export const contentMap = ", "").replace(/;$/, ""),
		);
		expect(docsChunk["docs.md"]).toContain("# Docs");
		expect(docsChunk["blog.md"]).toBeUndefined();
	});

	it("supports async chunk functions", async () => {
		await writeFile(path.join(testDir, "post.md"), "---\ntag: async\n---\n# Post");

		const options: PlaindownOptions = {
			emit: false,
			include: ["**/*.md"],
			experimental: {
				chunks: async (entry: PlaindownManifestEntry) => {
					// Simulate async operation
					await new Promise((resolve) => setTimeout(resolve, 1));
					return entry.frontmatter?.tag as string;
				},
			},
		};

		const plugin = plaindown(options);
		const config = createMockConfig(testDir);

		await configResolved(plugin, config);

		const manifestCode = (await load(plugin, "\0virtual:plaindown")) as string;
		const manifestMatch = manifestCode?.match(/export const plaindownManifest = ({[\s\S]*?});/);
		expect(manifestMatch).toBeDefined();
		const manifest = JSON.parse(manifestMatch?.[1]);

		expect(manifest.config.chunks["post.md"]).toBe("async");
	});

	it("returns empty contentMap for main module when chunks enabled", async () => {
		await writeFile(path.join(testDir, "blog.md"), "---\ncategory: blog\n---\n# Blog");

		const options: PlaindownOptions = {
			emit: false,
			include: ["**/*.md"],
			experimental: {
				chunks: (entry) => entry.frontmatter?.category as string,
			},
		};

		const plugin = plaindown(options);
		const config = createMockConfig(testDir);

		await configResolved(plugin, config);

		// Main content module should be empty when chunks are enabled
		const contentCode = (await load(plugin, "\0virtual:plaindown/content")) as string;
		expect(contentCode).toBe("export const contentMap = {};");
	});

	it("chunks by directory structure", async () => {
		await writeFile(path.join(testDir, "blog-post.md"), "# Blog Post");
		await writeFile(path.join(testDir, "docs-page.md"), "# Docs Page");

		const options: PlaindownOptions = {
			emit: false,
			include: ["**/*.md"],
			experimental: {
				chunks: (entry) => entry.slug.split("-")[0], // Extract first part of slug
			},
		};

		const plugin = plaindown(options);
		const config = createMockConfig(testDir);

		await configResolved(plugin, config);

		const manifestCode = (await load(plugin, "\0virtual:plaindown")) as string;
		const manifestMatch = manifestCode?.match(/export const plaindownManifest = ({[\s\S]*?});/);
		expect(manifestMatch).toBeDefined();
		const manifest = JSON.parse(manifestMatch?.[1]);

		expect(manifest.config.chunks["blog-post.md"]).toBe("blog");
		expect(manifest.config.chunks["docs-page.md"]).toBe("docs");
	});
});
