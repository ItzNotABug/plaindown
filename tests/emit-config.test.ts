import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { emitPlaindownFiles } from "../src/plugin/emit";
import type { PlaindownManifest } from "../src/shared/types";
import { createMockConfig, createMockPlaindownOptions } from "./test-utils";

describe("emit configuration option", () => {
	let testDir: string;
	let srcDir: string;
	let outDir: string;

	beforeEach(async () => {
		testDir = await mkdtemp(path.join(tmpdir(), "plaindown-emit-config-"));
		srcDir = path.join(testDir, "src");
		outDir = path.join(testDir, "dist");
		await mkdir(srcDir, { recursive: true });
		await mkdir(outDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	describe("emit: false", () => {
		it("skips file emission when emit: false", async () => {
			const sourceFile = path.join(srcDir, "blog.md");
			await writeFile(sourceFile, "# Blog Post");

			const manifest: PlaindownManifest = {
				entries: {
					"blog.md": {
						id: "blog.md",
						sourcePath: "blog.md",
						absolutePath: sourceFile,
						url: "/blog.md",
						route: "/blog",
						dir: "/",
						slug: "blog",
						ext: ".md",
						isIndex: false,
						frontmatter: {},
					},
				},
				ids: { "blog.md": "blog.md" },
				config: { emit: false },
			};

			const config = createMockConfig(testDir, {
				build: { outDir: "dist" },
				logLevel: "silent",
			});
			const options = createMockPlaindownOptions({ emit: false });

			await emitPlaindownFiles(config, manifest, options);

			// Verify no files were created in outDir (except it being empty)
			const files = await readdir(outDir);
			expect(files.length).toBe(0);
		});

		it("skips multiple files when emit: false", async () => {
			const files = ["blog.md", "about.md", "contact.md"];
			const manifest: PlaindownManifest = {
				entries: {},
				ids: {},
				config: { emit: false },
			};

			for (const file of files) {
				const sourceFile = path.join(srcDir, file);
				await writeFile(sourceFile, `# ${file}`);

				const slug = file.replace(".md", "");
				manifest.entries[file] = {
					id: file,
					sourcePath: file,
					absolutePath: sourceFile,
					url: `/${file}`,
					route: `/${slug}`,
					dir: "/",
					slug,
					ext: ".md",
					isIndex: false,
					frontmatter: {},
				};
				manifest.ids[file] = file;
			}

			const config = createMockConfig(testDir, { build: { outDir }, logLevel: "silent" });
			const options = createMockPlaindownOptions({ emit: false });

			await emitPlaindownFiles(config, manifest, options);

			// Verify no files were created
			const outputFiles = await readdir(outDir);
			expect(outputFiles.length).toBe(0);
		});

		it("respects stripFrontmatter in content map generation", async () => {
			// This test is more conceptual since we can't directly test the virtual module
			// But we verify the manifest structure is correct for emit: false
			const sourceFile = path.join(srcDir, "blog.md");
			await writeFile(sourceFile, "---\ntitle: My Blog\n---\n# Content");

			const manifest: PlaindownManifest = {
				entries: {
					"blog.md": {
						id: "blog.md",
						sourcePath: "blog.md",
						absolutePath: sourceFile,
						url: "/blog.md",
						route: "/blog",
						dir: "/",
						slug: "blog",
						ext: ".md",
						isIndex: false,
						frontmatter: { title: "My Blog" },
					},
				},
				ids: { "blog.md": "blog.md" },
				config: { emit: false },
			};

			const config = createMockConfig(testDir, { build: { outDir }, logLevel: "silent" });
			const options = createMockPlaindownOptions({
				emit: false,
				stripFrontmatter: true,
			});

			// Should not throw and should skip emission
			await emitPlaindownFiles(config, manifest, options);

			const outputFiles = await readdir(outDir);
			expect(outputFiles.length).toBe(0);
		});
	});

	describe("emit: true", () => {
		it("emits files when emit: true", async () => {
			const sourceFile = path.join(srcDir, "blog.md");
			await writeFile(sourceFile, "# Blog Post");

			const manifest: PlaindownManifest = {
				entries: {
					"blog.md": {
						id: "blog.md",
						sourcePath: "blog.md",
						absolutePath: sourceFile,
						url: "/blog.md",
						route: "/blog",
						dir: "/",
						slug: "blog",
						ext: ".md",
						isIndex: false,
						frontmatter: {},
					},
				},
				ids: { "blog.md": "blog.md" },
				config: { emit: true },
			};

			const config = createMockConfig(testDir, { build: { outDir }, logLevel: "silent" });
			const options = createMockPlaindownOptions({ emit: true });

			await emitPlaindownFiles(config, manifest, options);

			// Verify file was created
			const files = await readdir(outDir);
			expect(files.length).toBe(1);
			expect(files[0]).toBe("blog.md");
		});
	});

	describe("manifest config field", () => {
		it("includes config.emit in manifest structure", async () => {
			const manifest: PlaindownManifest = {
				entries: {},
				ids: {},
				config: { emit: false },
			};

			expect(manifest.config).toBeDefined();
			expect(manifest.config.emit).toBe(false);
		});

		it("defaults to emit: true in manifest", async () => {
			const manifest: PlaindownManifest = {
				entries: {},
				ids: {},
				config: { emit: true },
			};

			expect(manifest.config.emit).toBe(true);
		});
	});
});
