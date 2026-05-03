import { chunks, plaindownManifest } from "virtual:plaindown";
import { useData, withBase } from "vitepress";
import { type ComputedRef, computed } from "vue";

interface PlaindownUrlRef extends ComputedRef<string> {
	for: (id: string) => string;
}

function resolveEntry(id: string) {
	const sourcePath = plaindownManifest.ids[id] ?? id;
	return plaindownManifest.entries[sourcePath];
}

export function usePlaindown() {
	const { page } = useData();

	function currentId() {
		return page.value.relativePath;
	}

	function resolveUrl(id?: string) {
		const resolvedId = id ?? currentId();
		const entry = resolveEntry(resolvedId);
		return entry ? withBase(entry.url) : "";
	}

	const url = computed(() => resolveUrl()) as PlaindownUrlRef;

	url.for = (id: string) => resolveUrl(id);

	async function load(id?: string): Promise<string> {
		const resolvedId = id ?? currentId();

		// When emit: false, load from bundled content instead of fetching
		if (!plaindownManifest.config.emit) {
			const entry = resolveEntry(resolvedId);

			if (!entry) {
				throw new Error(`No Plaindown entry found for "${resolvedId}"`);
			}

			// When chunks are enabled, use the static chunk content maps
			if (plaindownManifest.config.chunks && chunks) {
				const chunkName = plaindownManifest.config.chunks[entry.id];

				if (!chunkName) {
					throw new Error(`No chunk mapping found for "${resolvedId}" (id: ${entry.id})`);
				}

				const chunk = chunks[chunkName];

				if (!chunk || !(entry.id in chunk)) {
					throw new Error(
						`No content found for "${resolvedId}" (id: ${entry.id}, chunk: ${chunkName})`,
					);
				}

				return chunk[entry.id];
			}

			// Default: single contentMap
			const { contentMap } = await import("virtual:plaindown/content");
			if (!(entry.id in contentMap)) {
				throw new Error(`No content found for "${resolvedId}" (id: ${entry.id})`);
			}

			return contentMap[entry.id];
		}

		// When emit: true, fetch from URL
		const target = resolveUrl(resolvedId);

		if (!target) {
			throw new Error(`No Plaindown URL found for "${resolvedId}"`);
		}

		const response = await fetch(target);

		if (!response.ok) {
			throw new Error(
				`Failed to load Markdown for "${resolvedId}": ${response.status} ${response.statusText}`,
			);
		}

		return await response.text();
	}

	async function copy(id?: string) {
		const markdown = await load(id);
		await navigator.clipboard.writeText(markdown);
	}

	return {
		url,
		load,
		copy,
	};
}
