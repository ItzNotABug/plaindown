import type { PlaindownOptions, ResolvedPlaindownOptions } from "../shared/types";

import { parseFrontmatter } from "./transform.js";

/**
 * Runtime check to ensure the plugin is running in Bun.
 * Fails fast with a clear error message if running in Node.js.
 */
export function ensureBunRuntime() {
	if (typeof Bun === "undefined") {
		throw new Error(
			[
				"❌ @itznotabug/plaindown requires Bun runtime.",
				"",
				"This plugin uses Bun-native APIs and will not work with Node.js.",
			].join("\n"),
		);
	}
}

/**
 * Resolve user options with defaults.
 */
export function resolvePlaindownOptions(options: PlaindownOptions): ResolvedPlaindownOptions {
	// Default exclusions that are always applied for safety
	const defaultExcludes = ["**/node_modules/**", "**/.vitepress/**", "**/dist/**", "**/build/**"];

	// User excludes extend (not replace) defaults
	const userExcludes = options.exclude
		? Array.isArray(options.exclude)
			? options.exclude
			: [options.exclude]
		: [];

	const resolvedExcludes = [...defaultExcludes, ...userExcludes];

	return {
		emit: options.emit ?? true,
		include: options.include ?? ["**/*.md"],
		exclude: resolvedExcludes,
		format: options.format ?? (({ route }) => `${route}.md`),
		identifier: options.identifier ?? (({ sourcePath }) => sourcePath),
		stripFrontmatter: options.stripFrontmatter ?? false,
		experimental: options.experimental,
	};
}

/**
 * Load file content from disk, optionally stripping frontmatter.
 */
export async function loadFileContent(
	absolutePath: string,
	stripFrontmatter: boolean,
): Promise<string> {
	const file = Bun.file(absolutePath);
	let content = await file.text();

	if (stripFrontmatter) {
		content = parseFrontmatter(content).content.trimStart();
	}

	return content;
}

/**
 * Process promises concurrently with a limit.
 * Prevents memory spikes and EMFILE errors on large file sets.
 * Preserves input order in results.
 */
export async function concurrent<T>(
	tasks: (() => Promise<T>)[],
	concurrency: number,
): Promise<T[]> {
	const results: (T | undefined)[] = new Array(tasks.length);
	const executing: Promise<void>[] = [];

	for (let i = 0; i < tasks.length; i++) {
		const index = i;
		const task = tasks[i];

		const promise = task().then((result) => {
			results[index] = result;
			executing.splice(executing.indexOf(promise), 1);
		});

		executing.push(promise);

		if (executing.length >= concurrency) {
			await Promise.race(executing);
		}
	}

	await Promise.all(executing);
	return results as T[];
}
