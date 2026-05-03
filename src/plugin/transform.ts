import path from "node:path";
import { YAML } from "bun";
import type { FrontmatterValue } from "../shared/types";

export interface ParsedMarkdown {
	content: string;
	data: Record<string, FrontmatterValue>;
}

/**
 * Parse frontmatter from Markdown content.
 * Uses Bun's native YAML parser for better performance.
 */
export function parseFrontmatter(markdown: string): ParsedMarkdown {
	// Match frontmatter with optional trailing newline and content
	const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?$/;
	const match = markdown.match(frontmatterRegex);

	if (!match) {
		// No frontmatter
		return {
			data: {},
			content: markdown,
		};
	}

	const yamlContent = match[1];
	const contentWithoutFrontmatter = match[2] ?? "";

	let data: Record<string, FrontmatterValue> = {};

	try {
		const parsed = YAML.parse(yamlContent);
		// parseYAML can return various types, ensure it's an object
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			data = parsed as Record<string, FrontmatterValue>;
		} else {
			// Parsed successfully but not an object - treat as invalid frontmatter
			return {
				data: {},
				content: markdown,
			};
		}
	} catch {
		// Invalid YAML in frontmatter - ignore and treat as no frontmatter
		return {
			data: {},
			content: markdown,
		};
	}

	return {
		data,
		content: contentWithoutFrontmatter,
	};
}

export function normalizeSourcePath(value: string) {
	return value.replaceAll("\\", "/").replace(/^\/+/, "");
}

export function createRouteParts(sourcePath: string) {
	const normalized = normalizeSourcePath(sourcePath);
	const ext = path.posix.extname(normalized);
	// Handle empty extension edge case
	const withoutExt = ext ? normalized.slice(0, -ext.length) : normalized;

	const parts = withoutExt.split("/");
	const slug = parts.at(-1) || "index";
	const dirParts = parts.slice(0, -1);

	const dir = dirParts.length ? `/${dirParts.join("/")}` : "/";
	const route = `/${withoutExt}`;
	const isIndex = slug === "index";

	return {
		route,
		dir,
		slug,
		ext,
		isIndex,
	};
}

export function normalizePublicUrl(value: string) {
	const normalized = value.replaceAll("\\", "/");

	if (!normalized.startsWith("/")) {
		return `/${normalized}`;
	}

	return normalized;
}

/**
 * Convert public URL to safe output path.
 * Validates against path traversal attacks (including URL-encoded variants).
 */
export function publicUrlToOutputPath(url: string, outDir?: string) {
	const normalized = normalizePublicUrl(url);
	const clean = normalized.replace(/^\/+/, "");

	// Decode URI components to catch encoded traversal attempts (%2e%2e, etc.)
	let decoded: string;
	try {
		decoded = decodeURIComponent(clean);
	} catch {
		// Invalid URI encoding
		throw new Error(`Invalid Plaindown output path (malformed URI): ${url}`);
	}

	// Check for path traversal - check for .. segments before normalization
	if (path.isAbsolute(decoded)) {
		throw new Error(`Invalid Plaindown output path (traversal detected): ${url}`);
	}

	// Split path and check each segment for .. traversal
	const segments = decoded.split(path.sep);
	for (const segment of segments) {
		if (segment === "..") {
			throw new Error(`Invalid Plaindown output path (traversal detected): ${url}`);
		}
	}

	// If outDir provided, verify the resolved path stays within it
	if (outDir) {
		const resolved = path.resolve(outDir, decoded);
		const normalizedOutDir = path.normalize(outDir);

		if (!resolved.startsWith(normalizedOutDir)) {
			throw new Error(`Invalid Plaindown output path (outside output directory): ${url}`);
		}
	}

	return clean;
}
