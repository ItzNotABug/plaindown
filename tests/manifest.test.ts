import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createPlaindownManifest } from "../src/plugin/manifest";
import { createMockConfig, createMockPlaindownOptions } from "./test-utils";

describe("createPlaindownManifest", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await mkdtemp(path.join(tmpdir(), "plaindown-test-"));
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	it("creates empty manifest when no files match", async () => {
		const config = createMockConfig(testDir, { command: "serve", mode: "development" });
		const options = createMockPlaindownOptions({
			exclude: ["**/node_modules/**", "**/.vitepress/**"],
		});

		const manifest = await createPlaindownManifest(config, options);

		expect(manifest).toEqual({
			entries: {},
			ids: {},
			config: { emit: true },
		});
	});

	it("uses sourcePath as default identifier", async () => {
		await writeFile(path.join(testDir, "blog.md"), "# Blog");

		const config = createMockConfig(testDir, { command: "serve", mode: "development" });
		const options = createMockPlaindownOptions({
			exclude: ["**/node_modules/**", "**/.vitepress/**"],
		});

		const manifest = await createPlaindownManifest(config, options);

		expect(manifest.entries["blog.md"]).toBeDefined();
		expect(manifest.entries["blog.md"].id).toBe("blog.md");
		expect(manifest.ids["blog.md"]).toBe("blog.md");
	});

	it("applies custom identifier function", async () => {
		await writeFile(path.join(testDir, "blog.md"), "# Blog");

		const config = createMockConfig(testDir, { command: "serve", mode: "development" });
		const options = createMockPlaindownOptions({
			exclude: ["**/node_modules/**", "**/.vitepress/**"],
			identifier: ({ slug }) => slug,
		});

		const manifest = await createPlaindownManifest(config, options);

		expect(manifest.entries["blog.md"].id).toBe("blog");
		expect(manifest.ids.blog).toBe("blog.md");
	});

	it("throws on duplicate identifiers", async () => {
		await writeFile(path.join(testDir, "blog.md"), "# Blog");
		await writeFile(path.join(testDir, "post.md"), "# Post");

		const config = createMockConfig(testDir, { command: "serve", mode: "development" });
		const options = createMockPlaindownOptions({
			exclude: ["**/node_modules/**", "**/.vitepress/**"],
			identifier: () => "same-id", // Both files get same ID
		});

		expect(createPlaindownManifest(config, options)).rejects.toThrow(/identifier collision/);
	});

	it("applies custom format function", async () => {
		await writeFile(path.join(testDir, "blog.md"), "# Blog");

		const config = createMockConfig(testDir, { command: "serve", mode: "development" });
		const options = createMockPlaindownOptions({
			exclude: ["**/node_modules/**", "**/.vitepress/**"],
			format: ({ slug }) => `/markdown/${slug}.txt`,
		});

		const manifest = await createPlaindownManifest(config, options);

		expect(manifest.entries["blog.md"].url).toBe("/markdown/blog.txt");
	});

	it("parses frontmatter and makes it available", async () => {
		await writeFile(
			path.join(testDir, "blog.md"),
			"---\nid: custom-id\ntitle: My Blog\n---\n# Blog",
		);

		const config = createMockConfig(testDir, { command: "serve", mode: "development" });
		const options = createMockPlaindownOptions({
			exclude: ["**/node_modules/**", "**/.vitepress/**"],
			identifier: ({ frontmatter }) => String(frontmatter.id ?? "default"),
		});

		const manifest = await createPlaindownManifest(config, options);

		expect(manifest.entries["blog.md"].id).toBe("custom-id");
		expect(manifest.ids["custom-id"]).toBe("blog.md");
	});

	it("excludes files matching exclude patterns", async () => {
		await writeFile(path.join(testDir, "blog.md"), "# Blog");
		await mkdir(path.join(testDir, "node_modules"), { recursive: true });
		await writeFile(path.join(testDir, "node_modules", "lib.md"), "# Lib");

		const config = createMockConfig(testDir, { command: "serve", mode: "development" });
		const options = createMockPlaindownOptions({
			exclude: ["**/node_modules/**", "**/.vitepress/**"],
		});

		const manifest = await createPlaindownManifest(config, options);

		expect(manifest.entries["blog.md"]).toBeDefined();
		expect(manifest.entries["node_modules/lib.md"]).toBeUndefined();
	});

	it("extends default excludes instead of replacing them", async () => {
		// Create files in default exclude directories
		await mkdir(path.join(testDir, "dist"), { recursive: true });
		await mkdir(path.join(testDir, "build"), { recursive: true });
		await mkdir(path.join(testDir, "drafts"), { recursive: true });

		await writeFile(path.join(testDir, "published.md"), "# Published");
		await writeFile(path.join(testDir, "dist", "artifact.md"), "# Dist");
		await writeFile(path.join(testDir, "build", "output.md"), "# Build");
		await writeFile(path.join(testDir, "drafts", "draft.md"), "# Draft");

		const config = createMockConfig(testDir, { command: "serve", mode: "development" });
		const options = createMockPlaindownOptions({
			// Only specify custom excludes - defaults should still apply
			exclude: ["**/drafts/**"],
		});

		const manifest = await createPlaindownManifest(config, options);

		// Published file should be included
		expect(manifest.entries["published.md"]).toBeDefined();

		// Default excludes should still work even though user didn't specify them
		expect(manifest.entries["dist/artifact.md"]).toBeUndefined();
		expect(manifest.entries["build/output.md"]).toBeUndefined();

		// User's custom exclude should work
		expect(manifest.entries["drafts/draft.md"]).toBeUndefined();
	});

	it("excludes custom build.outDir automatically", async () => {
		// Create files in custom outDir
		const customOutDir = "site-dist";
		await mkdir(path.join(testDir, customOutDir), { recursive: true });

		await writeFile(path.join(testDir, "published.md"), "# Published");
		await writeFile(path.join(testDir, customOutDir, "old.md"), "# Old Build Artifact");

		const config = createMockConfig(testDir, {
			command: "serve",
			mode: "development",
			build: { outDir: customOutDir },
		});
		const options = createMockPlaindownOptions();

		const manifest = await createPlaindownManifest(config, options);

		// Published file should be included
		expect(manifest.entries["published.md"]).toBeDefined();

		// Build artifact in custom outDir should be excluded
		expect(manifest.entries["site-dist/old.md"]).toBeUndefined();
	});

	it("excludes absolute build.outDir automatically", async () => {
		// Create files in absolute outDir
		const customOutDir = path.join(testDir, "absolute-dist");
		await mkdir(customOutDir, { recursive: true });

		await writeFile(path.join(testDir, "published.md"), "# Published");
		await writeFile(path.join(customOutDir, "old.md"), "# Old Build Artifact");

		const config = createMockConfig(testDir, {
			command: "serve",
			mode: "development",
			build: { outDir: customOutDir }, // Absolute path
		});
		const options = createMockPlaindownOptions();

		const manifest = await createPlaindownManifest(config, options);

		// Published file should be included
		expect(manifest.entries["published.md"]).toBeDefined();

		// Build artifact in absolute outDir should be excluded
		expect(manifest.entries["absolute-dist/old.md"]).toBeUndefined();
	});

	it("handles build.outDir outside project root", async () => {
		// When outDir is outside project root, we can't exclude it via glob
		// (it would require '../...' patterns which don't work with Bun.Glob)
		const outsideDir = path.join(path.dirname(testDir), "outside-build");

		await writeFile(path.join(testDir, "published.md"), "# Published");

		const config = createMockConfig(testDir, {
			command: "serve",
			mode: "development",
			build: { outDir: outsideDir }, // Outside project root
		});
		const options = createMockPlaindownOptions();

		// Should not throw and should process normally
		const manifest = await createPlaindownManifest(config, options);
		expect(manifest.entries["published.md"]).toBeDefined();
	});

	it("passes context to include function", async () => {
		await writeFile(path.join(testDir, "blog.md"), "# Blog");

		const config = createMockConfig(testDir, { command: "serve", mode: "development" });

		let capturedRoot = "";
		let capturedCommand = "";
		let capturedMode = "";

		const options = createMockPlaindownOptions({
			exclude: ["**/node_modules/**", "**/.vitepress/**"],
			include: (ctx) => {
				capturedRoot = ctx.root;
				capturedCommand = ctx.command;
				capturedMode = ctx.mode;
				return ["**/*.md"];
			},
		});

		await createPlaindownManifest(config, options);

		expect(capturedRoot).toBe(testDir);
		expect(capturedCommand).toBe("serve");
		expect(capturedMode).toBe("development");
	});

	it("throws on empty identifier", async () => {
		await writeFile(path.join(testDir, "blog.md"), "# Blog");

		const config = createMockConfig(testDir, { command: "serve", mode: "development" });
		const options = createMockPlaindownOptions({
			exclude: ["**/node_modules/**", "**/.vitepress/**"],
			identifier: () => "",
		});

		expect(createPlaindownManifest(config, options)).rejects.toThrow(
			/identifier must be a non-empty string/,
		);
	});

	it("throws when format returns empty string", async () => {
		await writeFile(path.join(testDir, "blog.md"), "# Blog");

		const config = createMockConfig(testDir, { command: "serve", mode: "development" });
		const options = createMockPlaindownOptions({
			exclude: ["**/node_modules/**", "**/.vitepress/**"],
			format: () => "",
		});

		expect(createPlaindownManifest(config, options)).rejects.toThrow(
			/Plaindown format must be a non-empty string/,
		);
	});

	it("handles nested directories", async () => {
		await mkdir(path.join(testDir, "blog", "2024"), { recursive: true });
		await writeFile(path.join(testDir, "blog", "2024", "post.md"), "# Post");

		const config = createMockConfig(testDir, { command: "serve", mode: "development" });
		const options = createMockPlaindownOptions({
			exclude: ["**/node_modules/**", "**/.vitepress/**"],
		});

		const manifest = await createPlaindownManifest(config, options);

		expect(manifest.entries["blog/2024/post.md"]).toBeDefined();
		expect(manifest.entries["blog/2024/post.md"].url).toBe("/blog/2024/post.md");
	});
});
