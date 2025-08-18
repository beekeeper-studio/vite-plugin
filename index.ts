import fs from "node:fs";
import path from "node:path";
import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";

type Entrypoint = {
  input: string; // relative to root
  output: string; // relative to root
};

type Options = {
  entrypoints: Entrypoint[];
};

/**
 * A Vite plugin for Beekeeper Studio plugin development that enables hot reloading
 * by automatically injecting Vite's dev client into HTML entrypoints and watching
 * for file changes during development.
 *
 * @param options - Configuration object containing entrypoints to process
 * @param options.entrypoints - Array of input/output file pairs to transform
 * @returns Vite plugin instance configured for development mode
 *
 * @example
 * ```ts
 * import { defineConfig } from 'vite';
 * import vue from '@vitejs/plugin-vue';
 * import bks from '@beekeeperstudio/vite-plugin-dev';
 *
 * export default defineConfig({
 *   plugins: [
 *     vue(), // optional
 *     bks({
 *       entrypoints: [
 *         {
 *           input: 'src/index.html',
 *           output: 'dist/index.html'
 *         }
 *       ]
 *     })
 *   ]
 * });
 * ```
 */
export default function bks(options: Options): Plugin {
  let config: ResolvedConfig;
  let portFromServer: number | undefined;

  const injectDevClient = (html: string, port: number): string => {
    const clientScript = `<script type="module" src="http://localhost:${port}/@vite/client"></script>`;
    const withClient = html.replace(
      /(<head[^>]*>)/i,
      `$1\n    ${clientScript}`,
    );

    // Rewrite all absolute URLs to use http://localhost:<port>/ prefix
    return withClient.replace(
      /(src|href)=["']\/([^"']+)["']/g,
      (_, attr, urlPath) => `${attr}="http://localhost:${port}/${urlPath}"`,
    );
  };

  const writeEntrypoint = (entry: Entrypoint, port: number) => {
    const root = config.root;
    const srcHtmlPath = path.resolve(root, entry.input);
    const outHtmlPath = path.resolve(root, entry.output);

    if (!fs.existsSync(srcHtmlPath)) {
      console.warn(`[bks] Source HTML not found: ${srcHtmlPath}`);
      return;
    }

    let html = fs.readFileSync(srcHtmlPath, "utf8");
    html = injectDevClient(html, port);

    fs.mkdirSync(path.dirname(outHtmlPath), { recursive: true });
    fs.writeFileSync(outHtmlPath, html, "utf8");
    console.info(`[bks] Emitted: ${outHtmlPath}`);
  };

  const watchFiles = (server: ViteDevServer) => {
    const devPort = portFromServer || server.config.server.port || 5173;
    for (const entry of options.entrypoints) {
      const absPath = path.resolve(config.root, entry.input);
      server.watcher.add(absPath);
      server.watcher.on("change", (changed) => {
        if (path.resolve(changed) === absPath) {
          writeEntrypoint(entry, devPort);
        }
      });
    }
  };

  return {
    name: "bks",
    apply: "serve",
    configResolved(_config) {
      config = _config;
    },
    configureServer(server) {
      const writeAll = () => {
        const devPort = portFromServer || server.config.server.port || 5173;
        options.entrypoints.forEach((entry) => writeEntrypoint(entry, devPort));
      };

      writeAll();
      server.httpServer?.once("listening", () => {
        const addr = server.httpServer?.address();
        if (addr && typeof addr === "object" && addr.port) {
          portFromServer = addr.port;
        }
        writeAll();
      });

      watchFiles(server);
    },
  };
}
