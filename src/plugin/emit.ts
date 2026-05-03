import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { ResolvedConfig } from "vite";
import type { PlaindownManifest, ResolvedPlaindownOptions } from "../shared/types";
import * as Logger from "./logger.js";
import { publicUrlToOutputPath } from "./transform.js";
import { concurrent, loadFileContent } from "./utils.js";

export async function emitPlaindownFiles(
	config: ResolvedConfig,
	manifest: PlaindownManifest,
	options: ResolvedPlaindownOptions,
	skipLog = false,
) {
	if (!options.emit) {
		return;
	}

	const outDir = path.isAbsolute(config.build.outDir)
		? config.build.outDir
		: path.resolve(config.root, config.build.outDir);

	const entries = Object.values(manifest.entries);
	const fileCount = entries.length;

	await concurrent(
		entries.map((entry) => async () => {
			const content = await loadFileContent(entry.absolutePath, options.stripFrontmatter);
			const outputRelativePath = publicUrlToOutputPath(entry.url, outDir);
			const outputPath = path.resolve(outDir, outputRelativePath);

			await mkdir(path.dirname(outputPath), { recursive: true });
			await Bun.write(outputPath, content);
		}),
		50,
	);

	if (!skipLog) {
		Logger.success(`emitted ${fileCount} markdown ${fileCount === 1 ? "file" : "files"}`);
	}
}
