import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { MockClipboard, MockFetch, MockFetchResponse, MockPage } from "@test/test-utils";
import {
	setupGlobalFetch,
	setupGlobalNavigator,
	setupPlaindownMock,
	setupVitePressMock,
	setupVueMock,
} from "@test/test-utils";
import type { PlaindownManifest } from "../src/shared/types";

describe("usePlaindown", () => {
	let mockManifest: PlaindownManifest;
	let mockPage: MockPage;
	let mockFetch: MockFetch;
	let mockClipboard: MockClipboard;

	beforeEach(() => {
		// Reset mocks before each test
		mockManifest = {
			entries: {
				"blog/post.md": {
					id: "blog/post.md",
					sourcePath: "blog/post.md",
					absolutePath: "/project/blog/post.md",
					url: "/blog/post.md",
					route: "/blog/post",
					dir: "/blog",
					slug: "post",
					ext: ".md",
					isIndex: false,
					frontmatter: {},
				},
				"about.md": {
					id: "about",
					sourcePath: "about.md",
					absolutePath: "/project/about.md",
					url: "/about.md",
					route: "/about",
					dir: "/",
					slug: "about",
					ext: ".md",
					isIndex: false,
					frontmatter: {},
				},
			},
			ids: {
				"blog/post.md": "blog/post.md",
				about: "about.md",
			},
			config: { emit: true },
		};

		mockPage = {
			value: {
				relativePath: "blog/post.md",
			},
		};

		// Mock fetch
		mockFetch = mock(async (url: string): Promise<MockFetchResponse> => {
			if (url === "/blog/post.md") {
				return {
					ok: true,
					status: 200,
					statusText: "OK",
					text: async () => "# Blog Post Content",
				};
			}
			if (url === "/about.md") {
				return {
					ok: true,
					status: 200,
					statusText: "OK",
					text: async () => "# About Content",
				};
			}
			return {
				ok: false,
				status: 404,
				statusText: "Not Found",
			};
		}) as MockFetch;

		// Mock clipboard
		mockClipboard = {
			writeText: mock(async () => {}),
		};

		// Setup mocks
		setupPlaindownMock(mockManifest);
		setupVitePressMock(mockPage);
		setupVueMock();
		setupGlobalFetch(mockFetch);
		setupGlobalNavigator(mockClipboard);
	});

	it("resolves current page URL", async () => {
		const { usePlaindown } = await import("../src/runtime/index");
		const plain = usePlaindown();

		expect(plain.url.value).toBe("/blog/post.md");
	});

	it("resolves URL for specific ID using sourcePath", async () => {
		const { usePlaindown } = await import("../src/runtime/index");
		const plain = usePlaindown();

		expect(plain.url.for("blog/post.md")).toBe("/blog/post.md");
	});

	it("resolves URL for specific ID using custom identifier", async () => {
		const { usePlaindown } = await import("../src/runtime/index");
		const plain = usePlaindown();

		expect(plain.url.for("about")).toBe("/about.md");
	});

	it("returns empty string for non-existent ID", async () => {
		const { usePlaindown } = await import("../src/runtime/index");
		const plain = usePlaindown();

		expect(plain.url.for("non-existent")).toBe("");
	});

	it("loads current page Markdown", async () => {
		const { usePlaindown } = await import("../src/runtime/index");
		const plain = usePlaindown();

		const content = await plain.load();

		expect(content).toBe("# Blog Post Content");
		expect(mockFetch).toHaveBeenCalledWith("/blog/post.md");
	});

	it("loads specific page Markdown by sourcePath", async () => {
		const { usePlaindown } = await import("../src/runtime/index");
		const plain = usePlaindown();

		const content = await plain.load("blog/post.md");

		expect(content).toBe("# Blog Post Content");
		expect(mockFetch).toHaveBeenCalledWith("/blog/post.md");
	});

	it("loads specific page Markdown by custom identifier", async () => {
		const { usePlaindown } = await import("../src/runtime/index");
		const plain = usePlaindown();

		const content = await plain.load("about");

		expect(content).toBe("# About Content");
		expect(mockFetch).toHaveBeenCalledWith("/about.md");
	});

	it("throws error when loading non-existent page", async () => {
		const { usePlaindown } = await import("../src/runtime/index");
		const plain = usePlaindown();

		expect(plain.load("non-existent")).rejects.toThrow(/No Plaindown URL found for "non-existent"/);
	});

	it("throws error with status info when fetch fails", async () => {
		const { usePlaindown } = await import("../src/runtime/index");
		const plain = usePlaindown();

		// Mock a non-existent page in manifest but fails to fetch
		mockManifest.entries["missing.md"] = {
			id: "missing.md",
			sourcePath: "missing.md",
			absolutePath: "/project/missing.md",
			url: "/missing.md",
			route: "/missing",
			dir: "/",
			slug: "missing",
			ext: ".md",
			isIndex: false,
			frontmatter: {},
		};
		mockManifest.ids["missing.md"] = "missing.md";

		expect(plain.load("missing.md")).rejects.toThrow(
			/Failed to load Markdown for "missing.md": 404 Not Found/,
		);
	});

	it("copies current page Markdown to clipboard", async () => {
		const { usePlaindown } = await import("../src/runtime/index");
		const plain = usePlaindown();

		await plain.copy();

		expect(mockClipboard.writeText).toHaveBeenCalledWith("# Blog Post Content");
	});

	it("copies specific page Markdown to clipboard", async () => {
		const { usePlaindown } = await import("../src/runtime/index");
		const plain = usePlaindown();

		await plain.copy("about");

		expect(mockClipboard.writeText).toHaveBeenCalledWith("# About Content");
	});

	it("does not call currentId() when id is provided to url.for", async () => {
		const { usePlaindown } = await import("../src/runtime/index");

		// Change current page
		mockPage.value.relativePath = "different.md";

		const plain = usePlaindown();

		// Should use provided ID, not current page
		const url = plain.url.for("about");

		expect(url).toBe("/about.md");
	});
});
