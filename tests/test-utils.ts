import { mock } from "bun:test";
import type { ServerResponse } from "node:http";
import type { Connect, Plugin, ResolvedConfig } from "vite";
import type { PlaindownManifest, ResolvedPlaindownOptions } from "../src/shared/types";

// Runtime mocks
export interface MockPage {
	value: {
		relativePath: string;
	};
}

export interface MockFetchResponse {
	ok: boolean;
	status: number;
	statusText: string;
	text?: () => Promise<string>;
}

export interface MockClipboard {
	writeText: ReturnType<typeof mock>;
}

export type MockFetch = (url: string) => Promise<MockFetchResponse>;

// noinspection JSUnusedGlobalSymbols
export function setupVitePressMock(mockPage: MockPage) {
	// noinspection JSUnusedGlobalSymbols
	mock.module("vitepress", () => ({
		useData: () => ({ page: mockPage }),
		withBase: (url: string) => url,
	}));
}

// noinspection JSUnusedGlobalSymbols
export function setupVueMock() {
	mock.module("vue", () => ({
		computed: <T>(fn: () => T) => {
			const result = {} as { value: T };
			Object.defineProperty(result, "value", {
				get: fn,
				enumerable: true,
			});
			return result;
		},
	}));
}

// noinspection JSUnusedGlobalSymbols
export function setupPlaindownMock(manifest: PlaindownManifest) {
	mock.module("virtual:plaindown", () => ({
		plaindownManifest: manifest,
		chunks: undefined,
	}));
}

// noinspection JSUnusedGlobalSymbols
export function setupGlobalFetch(mockFetch: MockFetch) {
	globalThis.fetch = mockFetch as typeof globalThis.fetch;
}

// noinspection JSUnusedGlobalSymbols
export function setupGlobalNavigator(mockClipboard: MockClipboard) {
	Object.defineProperty(globalThis, "navigator", {
		value: { clipboard: mockClipboard },
		writable: true,
		configurable: true,
	});
}

// noinspection JSUnusedGlobalSymbols
export function createMockRequest(url: string): Connect.IncomingMessage {
	return { url } as Connect.IncomingMessage;
}

// noinspection JSUnusedGlobalSymbols
export function createMockResponse() {
	let _statusCode = 0;
	const headers: Record<string, string> = {};
	let _body = "";

	// noinspection JSUnusedGlobalSymbols
	const mockResponse = {
		get statusCode() {
			return _statusCode;
		},
		set statusCode(value: number) {
			_statusCode = value;
		},
		setHeader: (key: string, value: string) => {
			headers[key] = value;
		},
		end: (content: string) => {
			_body = content;
		},
		get body() {
			return _body;
		},
		headers,
	};

	return mockResponse as typeof mockResponse & ServerResponse;
}

// noinspection JSUnusedGlobalSymbols
export function createMockNext(): Connect.NextFunction {
	return mock(() => {}) as Connect.NextFunction;
}

// Vite Plugin Hook Helpers
// Simplified type for Vite load hook in tests
type SimpleLoadFn = (id: string) => Promise<string | null | undefined>;
type SimpleLoadHook = SimpleLoadFn | { handler: SimpleLoadFn };

export async function configResolved(plugin: Plugin, config: ResolvedConfig): Promise<void> {
	const hook = plugin.configResolved;
	if (!hook) {
		throw new Error("configResolved hook is undefined");
	}
	if (typeof hook === "function") {
		await hook(config);
	} else {
		await hook.handler(config);
	}
}

export async function load(plugin: Plugin, id: string): Promise<string | null | undefined> {
	const hook = plugin.load as SimpleLoadHook | undefined;
	if (!hook) {
		throw new Error("load hook is undefined");
	}
	if (typeof hook === "function") {
		const result = await hook(id);
		return typeof result === "string" ? result : null;
	}
	const result = await hook.handler(id);
	return typeof result === "string" ? result : null;
}

// Mock Config Builder
type MockConfigOverrides = Omit<Partial<ResolvedConfig>, "build"> & {
	build?: Partial<ResolvedConfig["build"]>;
};

export function createMockConfig(root = "", overrides?: MockConfigOverrides): ResolvedConfig {
	const defaultBuild = {
		outDir: "dist",
	} as ResolvedConfig["build"];

	const defaults = {
		root,
		logLevel: "silent",
		base: "/",
		command: "serve",
		mode: "development",
		build: defaultBuild,
	};

	return {
		...defaults,
		...overrides,
		build: {
			...defaultBuild,
			...(overrides?.build || {}),
		} as Partial<ResolvedConfig["build"]> as ResolvedConfig["build"],
	} as ResolvedConfig;
}

// Mock Plaindown Options Builder
export function createMockPlaindownOptions(
	overrides?: Partial<ResolvedPlaindownOptions>,
): ResolvedPlaindownOptions {
	// Default excludes that match resolvePlaindownOptions
	const defaultExcludes = ["**/node_modules/**", "**/.vitepress/**", "**/dist/**", "**/build/**"];

	// If overrides.exclude is provided, merge it with defaults (extend not replace)
	const resolvedExcludes = overrides?.exclude
		? [...defaultExcludes, ...overrides.exclude]
		: defaultExcludes;

	return {
		emit: true,
		include: ["**/*.md"],
		format: ({ route }) => `${route}.md`,
		identifier: ({ sourcePath }) => sourcePath,
		stripFrontmatter: false,
		...overrides,
		exclude: resolvedExcludes,
	};
}
