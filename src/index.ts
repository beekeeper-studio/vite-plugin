import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";

type Entrypoint = {
  input: string; // relative to root
  output: string; // relative to root
};

type Options = {
  entrypoints: Entrypoint[];
};

function getManifestId(config: ResolvedConfig) {
  try {
    const manifestPath = path.resolve(config.root, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      return manifest.id || "";
    }
  } catch (error) {
    console.warn(`[bks] Could not read manifest.json: ${error}`);
    // Silently ignore errors reading manifest
  }
  return "";
}

/**
 * A Vite plugin for Beekeeper Studio plugin development.
 *
 * @param options - Configuration object containing entrypoints to process (defaults to index.html → dist/index.html)
 * @param options.entrypoints - Array of input/output file pairs to transform
 * @returns Vite plugin instance configured for development mode
 *
 * @example
 * ```ts
 * import { defineConfig } from 'vite';
 * import bks from '@beekeeperstudio/vite-plugin-dev';
 *
 * export default defineConfig({
 *   plugins: [
 *     bks(),
 *   ]
 * });
 * ```
 */
export default function bks(
  options: Options = {
    entrypoints: [{ input: "index.html", output: "dist/index.html" }],
  },
): Plugin {
  let config: ResolvedConfig;
  let portFromServer: number | undefined;

  // Read error template
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  const injectDevClient = (html: string, port: number): string => {
    const manifestId = getManifestId(config);
    const currentUrl = encodeURIComponent(window?.location?.href || '');
    const errorUrl = `./error.html?port=${port}${manifestId ? `&manifestId=${manifestId}` : ''}&target=${currentUrl}`;

    const clientScript = `<script>
      window.showViteError = function(e) {
        const currentUrl = encodeURIComponent(window.location.href);
        window.location.href = './error.html?port=${port}${manifestId ? `&manifestId=${manifestId}` : ''}&target=' + currentUrl;
      };
    </script>
    <script type="module" src="http://localhost:${port}/@vite/client" onerror="showViteError()"></script>`;

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

    console.log(
      `\x1b[32m✓\x1b[0m \x1b[36m[bks]\x1b[0m Transformed entrypoint: \x1b[33m${entry.input}\x1b[0m → \x1b[33m${entry.output}\x1b[0m`,
    );
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
    name: "bks-plugin",
    config: () => ({
      // Use relative path so beekeeper studio can load assets correctly
      base: "./",
      server: {
        cors: {
          // Ensure proper CORS
          origin: /^plugin:\/\//,
        },
      },
    }),
    configResolved(_config) {
      config = _config;
    },
    configureServer(server) {
      // Copy files for dev server
      const copyDevFiles = () => {
        try {
          // Copy to each entrypoint's output directory
          const outputDirs: string[] = [];
          
          options.entrypoints.forEach(entry => {
            const outputDir = path.resolve(config.root, path.dirname(entry.output));
            if (!outputDirs.includes(outputDir)) {
              outputDirs.push(outputDir);
            }
          });
          
          outputDirs.forEach(dir => {
            // Ensure directory exists
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            
            // Copy eventForwarder.js
            const eventForwarderSrc = path.resolve(config.root, "node_modules/@beekeeperstudio/plugin/dist/eventForwarder.js");
            if (fs.existsSync(eventForwarderSrc)) {
              fs.copyFileSync(eventForwarderSrc, path.resolve(dir, "eventForwarder.js"));
            }
            
            // Copy error.html
            const errorPageSrc = path.resolve(__dirname, "../error.html");
            if (fs.existsSync(errorPageSrc)) {
              fs.copyFileSync(errorPageSrc, path.resolve(dir, "error.html"));
            }
          });
          
          console.log("[bks] Copied dev files to output directories");
        } catch (error) {
          console.warn("[bks] Could not copy dev files:", error);
        }
      };

      // Copy files on server start
      copyDevFiles();

      // Add custom endpoint to return manifest ID
      server.middlewares.use((req, res, next) => {
        if (req.url === "/__bks_vite_plugin__info") {
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(JSON.stringify({ manifestId: getManifestId(config) }));
          return;
        }
        next();
      });

      // Add middleware to check origin
      server.middlewares.use((req, res, next) => {
        const origin = req.headers.origin;
        if (origin && origin.startsWith("plugin://")) {
          const manifestId = getManifestId(config);

          if (manifestId && origin !== `plugin://${manifestId}`) {
            res.writeHead(403);
            res.end();
            return;
          }
        }
        next();
      });

      const writeAll = () => {
        const devPort = portFromServer || server.config.server.port || 5173;
        options.entrypoints.forEach((entry) => writeEntrypoint(entry, devPort));
      };

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
