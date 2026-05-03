import { describe, expect, it } from "bun:test";
import {
	createRouteParts,
	normalizePublicUrl,
	normalizeSourcePath,
	publicUrlToOutputPath,
} from "../src/plugin/transform";

describe("normalizeSourcePath", () => {
	it("converts backslashes to forward slashes", () => {
		expect(normalizeSourcePath("blog\\post.md")).toBe("blog/post.md");
	});

	it("removes leading slashes", () => {
		expect(normalizeSourcePath("/blog/post.md")).toBe("blog/post.md");
		expect(normalizeSourcePath("///blog/post.md")).toBe("blog/post.md");
	});

	it("handles already normalized paths", () => {
		expect(normalizeSourcePath("blog/post.md")).toBe("blog/post.md");
	});
});

describe("createRouteParts", () => {
	it("creates route parts for blog/post.md", () => {
		const result = createRouteParts("blog/post.md");
		expect(result).toEqual({
			route: "/blog/post",
			dir: "/blog",
			slug: "post",
			ext: ".md",
			isIndex: false,
		});
	});

	it("creates route parts for blog/index.md", () => {
		const result = createRouteParts("blog/index.md");
		expect(result).toEqual({
			route: "/blog/index",
			dir: "/blog",
			slug: "index",
			ext: ".md",
			isIndex: true,
		});
	});

	it("creates route parts for index.md", () => {
		const result = createRouteParts("index.md");
		expect(result).toEqual({
			route: "/index",
			dir: "/",
			slug: "index",
			ext: ".md",
			isIndex: true,
		});
	});

	it("creates route parts for nested/a/b.md", () => {
		const result = createRouteParts("nested/a/b.md");
		expect(result).toEqual({
			route: "/nested/a/b",
			dir: "/nested/a",
			slug: "b",
			ext: ".md",
			isIndex: false,
		});
	});

	it("handles files with no extension", () => {
		const result = createRouteParts("blog/post");
		expect(result).toEqual({
			route: "/blog/post",
			dir: "/blog",
			slug: "post",
			ext: "",
			isIndex: false,
		});
	});

	it("handles files with multiple dots", () => {
		const result = createRouteParts("blog/my.post.md");
		expect(result).toEqual({
			route: "/blog/my.post",
			dir: "/blog",
			slug: "my.post",
			ext: ".md",
			isIndex: false,
		});
	});
});

describe("normalizePublicUrl", () => {
	it("adds leading slash if missing", () => {
		expect(normalizePublicUrl("blog/post.md")).toBe("/blog/post.md");
	});

	it("preserves existing leading slash", () => {
		expect(normalizePublicUrl("/blog/post.md")).toBe("/blog/post.md");
	});

	it("converts backslashes to forward slashes", () => {
		expect(normalizePublicUrl("blog\\post.md")).toBe("/blog/post.md");
	});
});

describe("publicUrlToOutputPath", () => {
	it("converts valid URL to output path", () => {
		expect(publicUrlToOutputPath("/blog/post.md")).toBe("blog/post.md");
	});

	it("handles URL without leading slash", () => {
		expect(publicUrlToOutputPath("blog/post.md")).toBe("blog/post.md");
	});

	it("removes multiple leading slashes", () => {
		expect(publicUrlToOutputPath("///blog/post.md")).toBe("blog/post.md");
	});

	it("throws on path traversal attempts", () => {
		expect(() => publicUrlToOutputPath("../secret.md")).toThrow(/traversal detected/);
		expect(() => publicUrlToOutputPath("/blog/../secret.md")).toThrow(/traversal detected/);
	});

	it("allows filenames containing .. that are not traversal", () => {
		// Regression: ensure we don't reject safe filenames like v1..md
		expect(publicUrlToOutputPath("/docs/v1..md")).toBe("docs/v1..md");
		expect(publicUrlToOutputPath("/docs/..hidden/file.md")).toBe("docs/..hidden/file.md");
	});

	it("throws on URL-encoded path traversal", () => {
		expect(() => publicUrlToOutputPath("%2e%2e/secret.md")).toThrow(/traversal detected/);
		expect(() => publicUrlToOutputPath("%2e%2e%2fsecret.md")).toThrow(/traversal detected/);
	});

	it("allows web paths starting with slash", () => {
		// /absolute/path is a valid web URL - becomes "absolute/path" after cleaning
		expect(publicUrlToOutputPath("/absolute/path")).toBe("absolute/path");
	});

	it("throws on malformed URI encoding", () => {
		expect(() => publicUrlToOutputPath("%ZZ%invalid")).toThrow(/malformed URI/);
	});

	it("validates against outDir if provided", () => {
		const outDir = "/project/dist";

		// Valid path
		expect(publicUrlToOutputPath("/blog/post.md", outDir)).toBe("blog/post.md");

		// Path traversal that escapes outDir
		expect(() => publicUrlToOutputPath("/../secrets.md", outDir)).toThrow(/traversal detected/);
	});
});
