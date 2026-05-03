import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	createMockConfig,
	createMockNext,
	createMockPlaindownOptions,
	createMockRequest,
	createMockResponse,
} from "@test/test-utils";
import { createPlaindownMiddleware } from "../src/plugin/server";
import type { PlaindownManifest } from "../src/shared/types";

describe("createPlaindownMiddleware", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await mkdtemp(path.join(tmpdir(), "plaindown-server-"));
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	it("serves matching URL with Markdown content", async () => {
		const sourceFile = path.join(testDir, "blog.md");
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

		const config = createMockConfig();
		const options = createMockPlaindownOptions();
		const middleware = createPlaindownMiddleware(config, () => manifest, options);

		const req = createMockRequest("/blog.md");
		const res = createMockResponse();
		const next = createMockNext();

		await middleware(req, res, next);

		expect(res.statusCode).toBe(200);
		expect(res.headers["Content-Type"]).toBe("text/markdown; charset=utf-8");
		expect(res.body).toBe("# Blog Post");
		expect(next).not.toHaveBeenCalled();
	});

	it("calls next() for non-matching URLs", async () => {
		const manifest: PlaindownManifest = {
			entries: {},
			ids: {},
			config: { emit: true },
		};

		const config = createMockConfig();
		const options = createMockPlaindownOptions();
		const middleware = createPlaindownMiddleware(config, () => manifest, options);

		const req = createMockRequest("/not-found.md");
		const res = createMockResponse();
		const next = mock(() => {});

		await middleware(req, res, next);

		expect(next).toHaveBeenCalled();
	});

	it("strips query strings from URL", async () => {
		const sourceFile = path.join(testDir, "blog.md");
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

		const config = createMockConfig();
		const options = createMockPlaindownOptions();
		const middleware = createPlaindownMiddleware(config, () => manifest, options);

		const req = createMockRequest("/blog.md?nocache=1");
		const res = createMockResponse();
		const next = mock(() => {});

		await middleware(req, res, next);

		expect(res.statusCode).toBe(200);
		expect(res.body).toBe("# Blog");
	});

	it("strips base path from URL", async () => {
		const sourceFile = path.join(testDir, "blog.md");
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

		const config = createMockConfig("", { base: "/base/" });
		const options = createMockPlaindownOptions();
		const middleware = createPlaindownMiddleware(config, () => manifest, options);

		const req = createMockRequest("/base/blog.md");
		const res = createMockResponse();
		const next = mock(() => {});

		await middleware(req, res, next);

		expect(res.statusCode).toBe(200);
		expect(res.body).toBe("# Blog");
	});

	it("strips frontmatter when stripFrontmatter is true", async () => {
		const sourceFile = path.join(testDir, "blog.md");
		await writeFile(sourceFile, "---\ntitle: Blog\n---\n# Blog");

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

		const config = createMockConfig();
		const options = createMockPlaindownOptions({
			stripFrontmatter: true,
		});
		const middleware = createPlaindownMiddleware(config, () => manifest, options);

		const req = createMockRequest("/blog.md");
		const res = createMockResponse();
		const next = createMockNext();

		await middleware(req, res, next);

		expect(res.statusCode).toBe(200);
		expect(res.body).toBe("# Blog");
	});

	it("uses fresh manifest from getter function", async () => {
		const sourceFile = path.join(testDir, "blog.md");
		await writeFile(sourceFile, "# Blog");

		let manifest: PlaindownManifest = {
			entries: {},
			ids: {},
			config: { emit: true },
		};

		const config = createMockConfig();
		const options = createMockPlaindownOptions();
		const middleware = createPlaindownMiddleware(config, () => manifest, options);

		const req = createMockRequest("/blog.md");
		const res = createMockResponse();
		const next = mock(() => {});

		// First call - manifest is empty
		await middleware(req, res, next);
		expect(next).toHaveBeenCalled();

		// Update manifest
		manifest = {
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

		// Second call - should use new manifest
		const res2 = createMockResponse();
		const next2 = mock(() => {});
		await middleware(req, res2, next2);

		expect(res2.statusCode).toBe(200);
		expect(res2.body).toBe("# Blog");
		expect(next2).not.toHaveBeenCalled();
	});

	it("caches file content based on mtime", async () => {
		const sourceFile = path.join(testDir, "blog.md");
		await writeFile(sourceFile, "# Version 1");

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

		const config = createMockConfig();
		const options = createMockPlaindownOptions();
		const middleware = createPlaindownMiddleware(config, () => manifest, options);

		// First request
		const req1 = createMockRequest("/blog.md");
		const res1 = createMockResponse();
		const next1 = createMockNext();
		await middleware(req1, res1, next1);

		expect(res1.body).toBe("# Version 1");

		// Update file
		await writeFile(sourceFile, "# Version 2");

		// Second request - should detect mtime change and reload
		const req2 = createMockRequest("/blog.md");
		const res2 = createMockResponse();
		const next2 = createMockNext();
		await middleware(req2, res2, next2);

		expect(res2.body).toBe("# Version 2");
	});

	it("respects emit: false and returns 404 in dev mode", async () => {
		const sourceFile = path.join(testDir, "blog.md");
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

		const config = createMockConfig();
		const options = createMockPlaindownOptions({
			emit: false,
		});
		const middleware = createPlaindownMiddleware(config, () => manifest, options);

		const req = createMockRequest("/blog.md");
		const res = createMockResponse();
		const next = createMockNext();

		await middleware(req, res, next);

		// Should return 404
		expect(next).toHaveBeenCalled();
		expect(res.statusCode).not.toBe(200);
	});

	it("serves files normally when emit: true in dev mode", async () => {
		const sourceFile = path.join(testDir, "blog.md");
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

		const config = createMockConfig();
		const options = createMockPlaindownOptions({
			emit: true,
		});
		const middleware = createPlaindownMiddleware(config, () => manifest, options);

		const req = createMockRequest("/blog.md");
		const res = createMockResponse();
		const next = createMockNext();

		await middleware(req, res, next);

		expect(next).not.toHaveBeenCalled();
		expect(res.statusCode).toBe(200);
		expect(res.body).toBe("# Blog Post");
	});
});
