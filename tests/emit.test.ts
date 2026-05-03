import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { emitPlaindownFiles } from "../src/plugin/emit";
import type { PlaindownManifest } from "../src/shared/types";
import { createMockConfig, createMockPlaindownOptions } from "./test-utils";

describe("emitPlaindownFiles", () => {
	let testDir: string;
	let srcDir: string;
	let outDir: string;

	beforeEach(async () => {
		testDir = await mkdtemp(path.join(tmpdir(), "plaindown-emit-"));
		srcDir = path.join(testDir, "src");
		outDir = path.join(testDir, "dist");
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	it("writes files to expected output path", async () => {
		await mkdir(srcDir, { recursive: true });
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

		const config = createMockConfig(testDir, { build: { outDir } });
		const options = createMockPlaindownOptions();

		await emitPlaindownFiles(config, manifest, options);

		const outputFile = path.join(outDir, "blog.md");
		const content = await readFile(outputFile, "utf8");
		expect(content).toBe("# Blog Post");
	});

	it("creates parent directories recursively", async () => {
		await mkdir(path.join(srcDir, "nested", "deep"), { recursive: true });
		const sourceFile = path.join(srcDir, "nested", "deep", "post.md");
		await writeFile(sourceFile, "# Nested Post");

		const manifest: PlaindownManifest = {
			entries: {
				"nested/deep/post.md": {
					id: "nested/deep/post.md",
					sourcePath: "nested/deep/post.md",
					absolutePath: sourceFile,
					url: "/nested/deep/post.md",
					route: "/nested/deep/post",
					dir: "/nested/deep",
					slug: "post",
					ext: ".md",
					isIndex: false,
					frontmatter: {},
				},
			},
			ids: { "nested/deep/post.md": "nested/deep/post.md" },
			config: { emit: true },
		};

		const config = createMockConfig(testDir, { build: { outDir } });
		const options = createMockPlaindownOptions();

		await emitPlaindownFiles(config, manifest, options);

		const outputFile = path.join(outDir, "nested", "deep", "post.md");
		const content = await readFile(outputFile, "utf8");
		expect(content).toBe("# Nested Post");
	});

	it("preserves frontmatter by default", async () => {
		await mkdir(srcDir, { recursive: true });
		const sourceFile = path.join(srcDir, "blog.md");
		const content = "---\ntitle: My Blog\n---\n# Blog";
		await writeFile(sourceFile, content);

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

		const config = createMockConfig(testDir, { build: { outDir } });
		const options = createMockPlaindownOptions();

		await emitPlaindownFiles(config, manifest, options);

		const outputFile = path.join(outDir, "blog.md");
		const outputContent = await readFile(outputFile, "utf8");
		expect(outputContent).toBe(content);
	});

	it("strips frontmatter when stripFrontmatter is true", async () => {
		await mkdir(srcDir, { recursive: true });
		const sourceFile = path.join(srcDir, "blog.md");
		await writeFile(sourceFile, "---\ntitle: My Blog\n---\n# Blog");

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

		const config = createMockConfig(testDir, { build: { outDir } });
		const options = createMockPlaindownOptions({
			stripFrontmatter: true,
		});

		await emitPlaindownFiles(config, manifest, options);

		const outputFile = path.join(outDir, "blog.md");
		const content = await readFile(outputFile, "utf8");
		expect(content).toBe("# Blog");
	});

	it("handles relative outDir paths", async () => {
		await mkdir(srcDir, { recursive: true });
		const sourceFile = path.join(srcDir, "blog.md");
		await writeFile(sourceFile, "# Blog");

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

		// Use relative path
		const config = createMockConfig(testDir, { build: { outDir: "dist" } });
		const options = createMockPlaindownOptions();

		await emitPlaindownFiles(config, manifest, options);

		const outputFile = path.join(testDir, "dist", "blog.md");
		const content = await readFile(outputFile, "utf8");
		expect(content).toBe("# Blog");
	});

	it("emits multiple files in parallel", async () => {
		await mkdir(srcDir, { recursive: true });
		const files = ["blog1.md", "blog2.md", "blog3.md"];

		const manifest: PlaindownManifest = {
			entries: {},
			ids: {},
			config: { emit: true },
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

		const config = createMockConfig(testDir, { build: { outDir } });
		const options = createMockPlaindownOptions();

		await emitPlaindownFiles(config, manifest, options);

		// Verify all files written
		for (const file of files) {
			const outputFile = path.join(outDir, file);
			const content = await readFile(outputFile, "utf8");
			expect(content).toBe(`# ${file}`);
		}
	});

	it("rejects path traversal in URL", async () => {
		await mkdir(srcDir, { recursive: true });
		const sourceFile = path.join(srcDir, "blog.md");
		await writeFile(sourceFile, "# Blog");

		const manifest: PlaindownManifest = {
			entries: {
				"blog.md": {
					id: "blog.md",
					sourcePath: "blog.md",
					absolutePath: sourceFile,
					url: "/../secrets.md", // Malicious URL
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

		const config = createMockConfig(testDir, { build: { outDir } });
		const options = createMockPlaindownOptions();

		expect(emitPlaindownFiles(config, manifest, options)).rejects.toThrow(/traversal detected/);
	});
});
