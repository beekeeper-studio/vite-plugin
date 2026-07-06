import fs from "node:fs";
import os from "node:os";
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

function bold(s: string) {
  return `\x1b[1m${s}\x1b[22m`;
}

function cyan(s: string) {
  return `\x1b[36m${s}\x1b[0m`;
}

function green(s: string) {
  return `\x1b[32m${s}\x1b[0m`;
}

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

/** Resolve Beekeeper Studio's plugins directory for the current OS. */
function getPluginsDir(): string | null {
  switch (process.platform) {
    case "win32":
      return process.env.APPDATA
        ? path.join(process.env.APPDATA, "beekeeper-studio", "plugins")
        : null;
    case "darwin":
      return path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "beekeeper-studio",
        "plugins",
      );
    default:
      // Linux and others — XDG-aware since Beekeeper Studio is an Electron app.
      return path.join(
        process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
        "beekeeper-studio",
        "plugins",
      );
  }
}

type InstallStatus = {
  ok: boolean;
  text: string;
  /** A wrong-but-fixable install that BKS_FORCE_INSTALL can re-link. */
  fixable?: boolean;
};

/** Ensure this project is installed as a development symlink inside Beekeeper
 * Studio's plugins directory. Installs it if missing. */
function ensurePluginInstalled(config: ResolvedConfig): InstallStatus {
  const id = getManifestId(config);
  if (!id) {
    return { ok: false, text: "no plugin id in manifest.json" };
  }

  const pluginsDir = getPluginsDir();
  if (!pluginsDir) {
    return {
      ok: false,
      text: "beekeeper studio's plugins directory not found",
    };
  }

  const target = path.join(pluginsDir, id);
  const projectRoot = fs.realpathSync(config.root);

  // Use lstat (not existsSync) so a broken symlink still counts as "present".
  let stat: fs.Stats | null;
  try {
    stat = fs.lstatSync(target);
  } catch {
    stat = null;
  }

  if (stat === null) {
    // Not installed — install it as a development symlink.
    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.symlinkSync(
      config.root,
      target,
      process.platform === "win32" ? "junction" : "dir",
    );
    return { ok: true, text: `${bold("Beekeeper Studio")}: ${cyan(id)} ${green("is live")}` };
  }

  if (!stat.isSymbolicLink()) {
    return {
      ok: false,
      fixable: true,
      text: `changes won't hot-reload - ${id} is a plain folder, not a symlink`,
    };
  }

  let linked: string;
  try {
    linked = fs.realpathSync(target);
  } catch {
    return {
      ok: false,
      fixable: true,
      text: `${id} symlink is broken`,
    };
  }

  if (linked === projectRoot) {
    return { ok: true, text: `${bold("Beekeeper Studio")}: ${cyan(id)} ${green("is live")}` };
  }

  return {
    ok: false,
    fixable: true,
    text: `changes won't hot-reload - ${id} is linked to another project`,
  };
}

/** Force-replace whatever is at plugins/<id> with a fresh dev symlink
 * pointing at this project. */
function relinkPlugin(config: ResolvedConfig): InstallStatus {
  const id = getManifestId(config);
  if (!id) {
    return { ok: false, text: "no plugin id in manifest.json — can't re-link" };
  }

  const pluginsDir = getPluginsDir();
  if (!pluginsDir) {
    return { ok: false, text: "plugins directory not found — can't re-link" };
  }

  const target = path.join(pluginsDir, id);

  // Already linked to this project — nothing to do
  try {
    if (fs.realpathSync(target) === fs.realpathSync(config.root)) {
      return {
        ok: true,
        text: `${bold("Beekeeper Studio")}: ${cyan(id)} ${green("is live")}`,
      };
    }
  } catch {
    // target missing or broken — fall through and (re)create it.
  }

  // force: true won't throw when target is absent; removes a symlink (not its
  // target) or a whole folder.
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.symlinkSync(
    config.root,
    target,
    process.platform === "win32" ? "junction" : "dir",
  );
  return { ok: true, text: `${bold("Beekeeper Studio")}: ${cyan(id)} ${green("is live")}` };
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
    const currentUrl = encodeURIComponent(window?.location?.href || "");

    const clientScript = `<script>
      window.showViteError = function(e) {
        const currentUrl = encodeURIComponent(window.location.href);
        window.location.href = './error.html?port=${port}${manifestId ? `&manifestId=${manifestId}` : ""}&target=' + currentUrl;
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

    // Only in debug mode (e.g. `vite --debug` or `DEBUG=* vite`).
    if (process.env.DEBUG) {
      console.log(
        `\x1b[32m✓\x1b[0m \x1b[36m[bks]\x1b[0m Transformed entrypoint: \x1b[33m${entry.input}\x1b[0m → \x1b[33m${entry.output}\x1b[0m`,
      );
    }
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
      // Verify (and install if needed) this project as a dev symlink in
      // Beekeeper Studio's plugins directory. Never blocks server startup.

      // Vite's CLI parser rejects unknown flags, so use an env var instead:
      // `BKS_FORCE_INSTALL=1 vite` replaces whatever is there with a fresh symlink.
      const forceInstall = process.env.BKS_FORCE_INSTALL === "1";
      let installStatus: InstallStatus;
      try {
        installStatus = forceInstall
          ? relinkPlugin(config)
          : ensurePluginInstalled(config);
      } catch (error) {
        installStatus = { ok: false, text: `install check failed: ${error}` };
      }

      // Copy files for dev server
      const copyDevFiles = () => {
        try {
          // Copy to each entrypoint's output directory
          const outputDirs: string[] = [];

          options.entrypoints.forEach((entry) => {
            const outputDir = path.resolve(
              config.root,
              path.dirname(entry.output),
            );
            if (!outputDirs.includes(outputDir)) {
              outputDirs.push(outputDir);
            }
          });

          outputDirs.forEach((dir) => {
            // Ensure directory exists
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }

            // Copy eventForwarder.js
            const eventForwarderSrc = path.resolve(
              config.root,
              "node_modules/@beekeeperstudio/plugin/dist/eventForwarder.js",
            );
            if (fs.existsSync(eventForwarderSrc)) {
              fs.copyFileSync(
                eventForwarderSrc,
                path.resolve(dir, "eventForwarder.js"),
              );
            }

            // Copy error.html
            const errorPageSrc = path.resolve(__dirname, "../error.html");
            if (fs.existsSync(errorPageSrc)) {
              fs.copyFileSync(errorPageSrc, path.resolve(dir, "error.html"));
            }
          });
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

      // Append our line to Vite's URL banner (the "➜" block).
      const printUrls = server.printUrls;
      server.printUrls = () => {
        printUrls();

        // >>>> Our status line <<<<<

        /** Green arrow when hot-reload works, yellow when it won't */
        const arrow = installStatus.ok
          ? "\x1b[32m➜\x1b[0m"
          : "\x1b[33m➜\x1b[0m";

        // The ok text carries its own colors: default fg / cyan / green.
        let text = installStatus.text;
        if (installStatus.fixable) {
          text += ` (try ${bold("BKS_FORCE_INSTALL=1")})`;
        }

        server.config.logger.info(`  ${arrow}  ${text}`);
      };

      watchFiles(server);
    },
  };
}
