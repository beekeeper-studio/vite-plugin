# @beekeeperstudio/vite-plugin

A Vite plugin for Beekeeper Studio plugin development that enables hot reloading (HMR) by automatically injecting Vite's dev client into HTML entrypoints and watching for file changes during development.

## Installation

```bash
npm install @beekeeperstudio/vite-plugin --save-dev
# or
yarn add @beekeeperstudio/vite-plugin --dev
```

## Usage

```ts
import { defineConfig } from 'vite';
import bks from '@beekeeperstudio/vite-plugin';

export default defineConfig({
  plugins: [
    vue(), // example: use the plugin for your framework (Vue, React, Svelte, etc.)
    bks({
      entrypoints: [
        {
          input: 'src/index.html',
          output: 'dist/index.html'
        }
      ]
    })
  ]
});
```

## Options

### `entrypoints`

An array of objects defining input/output file pairs to transform:

- `input` (string): Path to the source HTML file, relative to the project root
- `output` (string): Path where the transformed HTML file should be written, relative to the project root

## License

MIT
