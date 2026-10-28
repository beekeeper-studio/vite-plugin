# @beekeeperstudio/vite-plugin

A [Vite](https://vite.dev) build plugin for Beekeeper Studio plugin development. Use it alongside
the [Beekeeper Studio Plugin SDK](https://github.com/beekeeper-studio/plugin)
(`@beekeeperstudio/plugin`), which your plugin uses to talk to the app.

## Documentation

- [Beekeeper Studio Plugin SDK](https://github.com/beekeeper-studio/plugin) - the SDK this build plugin pairs with
- [Plugin SDK docs](https://docs.beekeeperstudio.io/plugin_development/sdk/) - overview of the SDK and this build plugin
- [Creating Your First Plugin](https://docs.beekeeperstudio.io/plugin_development/creating-your-first-plugin/) - tutorial that uses this build plugin
- [SDK Reference](https://docs.beekeeperstudio.io/plugin_development/api-reference/) - every function, event and type in the SDK

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

2. Install `@beekeeperstudio/vite-plugin` and the [Plugin SDK](https://github.com/beekeeper-studio/plugin)

```bash
npm install --save-dev @beekeeperstudio/vite-plugin
npm install @beekeeperstudio/plugin
# or
yarn add -D @beekeeperstudio/vite-plugin
yarn add @beekeeperstudio/plugin
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
