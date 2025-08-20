# @beekeeperstudio/vite-plugin

A Vite plugin for Beekeeper Studio plugin development.

## What It Does

- Enables **Hot Module Replacement (HMR)** during development
- Transforms HTML for production builds — ensuring correct URLs and paths in bundled plugin files

## Installation

```bash
npm install --save-dev @beekeeperstudio/vite-plugin
# or
yarn add -D @beekeeperstudio/vite-plugin
```

## Usage

1. Create a vite project with [create-vite](https://vite.dev/guide/#scaffolding-your-first-vite-project)

```bash
npm create vite@latest
# or
yarn create vite
```

2. Install `@beekeeperstudio/vite-plugin`

```bash
npm install --save-dev @beekeeperstudio/vite-plugin
# or
yarn add -D @beekeeperstudio/vite-plugin
```

3. Update vite.config.ts

```diff
import { defineConfig } from 'vite';
+ import bks from '@beekeeperstudio/vite-plugin';

export default defineConfig({
+  plugins: [bks()],
});
```

## Options

### `entrypoints` (optional)

An array of objects defining input/output file pairs to transform:

- `input` (string): Path to the source HTML file, relative to the project root
- `output` (string): Path where the transformed HTML file should be written, relative to the project root

**Default:**

```ts
[{ input: "index.html", output: "dist/index.html" }]
```

```ts
export default defineConfig({
  plugins: [
    bks({
      entrypoints: [
        { input: "index.html", output: "dist/index.html" },
        { input: "config.html", output: "dist/config.html" },
      ]
    })
  ]
});
```

## License

MIT
