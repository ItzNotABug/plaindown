# Plaindown

[![npm version](https://img.shields.io/npm/v/@itznotabug/plaindown.svg?logo=npm&logoColor=white)](https://www.npmjs.com/package/@itznotabug/plaindown)
[![License](https://img.shields.io/npm/l/%40itznotabug%2Fplaindown?logo=apache&logoColor=white&color=blue)](https://github.com/ItzNotABug/plaindown/blob/main/LICENSE)
[![Vite](https://img.shields.io/badge/Vite-5.x%20|%206.x%20-646CFF.svg?logo=vite&logoColor=white)](https://vite.dev/)
[![VitePress](https://img.shields.io/badge/VitePress-1.x-5a67d8.svg?logo=vitepress&logoColor=white)](https://vitepress.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-required-f472b6.svg?logo=bun&logoColor=white)](https://bun.sh/)
[![Built with Claude](https://img.shields.io/badge/Built%20with-Claude-D97757.svg)](https://claude.ai/)
[![Reviewed by Codex](https://img.shields.io/badge/Reviewed%20by-Codex-0A7AFF.svg)](https://openai.com/codex/)

Plaindown is a Bun-powered Vite and VitePress plugin that exposes selected `.md` files as plain Markdown endpoints.

It is built for plain-text publishing and programmatic Markdown access in workflows like AI SEO, GEO, search indexing,
content syndication, custom readers, and internal content pipelines.

## Install

```bash
bun add @itznotabug/plaindown
```

Bun is required at runtime.

## Quick Start

```ts
// .vitepress/config.ts
import { defineConfig } from "vitepress";
import { plaindown } from "@itznotabug/plaindown/plugin";

export default defineConfig({
    vite: {
        plugins: [
            plaindown({
                include: ["blog/**/*.md"],
            }),
        ],
    },
});
```

With the default `format`, `blog/my-post.md` is available at `/blog/my-post.md`.

## Runtime

```ts
import { usePlaindown } from "@itznotabug/plaindown/runtime";

const plain = usePlaindown();

plain.url.value;
plain.url.for("blog/my-post.md");

await plain.load();
await plain.load("blog/my-post.md");

await plain.copy();
await plain.copy("blog/my-post.md");
```

## Why Use It

- Publish raw Markdown beside rendered VitePress pages
- Give LLMs, crawlers, and automation tools a stable Markdown source
- Reuse Markdown in-app without making it publicly routable
- Optionally strip frontmatter from emitted files
- Split bundled Markdown into lazy-loaded chunks when `emit: false`

## Core Options

```ts
plaindown({
    enabled: true,
    emit: true,
    include: ["**/*.md"],
    exclude: ["**/drafts/**"],
    format: ({ route }) => `${route}.md`,
    identifier: ({ sourcePath }) => sourcePath,
    stripFrontmatter: false,
    experimental: {
        chunks: (entry) => entry.dir,
    },
});
```

| Option                | What it does                                                                                                                                                                                    |
|-----------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `emit`                | When `true` (default): Emits files at build time and serves matching routes in dev.<br>When `false`: Bundles Markdown into JavaScript so `usePlaindown()` can load it without public endpoints. |
| `include` / `exclude` | Controls which Markdown files are indexed. Default safety exclusions stay in place, including common output directories and Vite `build.outDir`.                                                |
| `format`              | Controls the public URL. Default: `${route}.md`.                                                                                                                                                |
| `identifier`          | Controls how runtime callers reference entries. Default: `sourcePath`.                                                                                                                          |
| `stripFrontmatter`    | Removes frontmatter from emitted, served, and bundled content.                                                                                                                                  |
| `experimental.chunks` | Only for `emit: false`. Splits bundled Markdown into lazy-loaded chunks. `null` or `undefined` falls back to `_default`.                                                                        |

## How It Works

- Dev: middleware serves matching Markdown routes with caching
- Build: files are emitted concurrently with bounded IO
- Runtime: `usePlaindown()` resolves URLs and loads bundled or fetched Markdown

## Notes

- `Bun` is required because the plugin uses its APIs
- `experimental.chunks` is intentionally experimental

## Development

```bash
bun install
bun run typecheck
bun test
bun run build
```
