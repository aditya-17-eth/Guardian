import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const workspaceRoot = path.dirname(fileURLToPath(import.meta.url));
const guardianAssetsDir = path.resolve(workspaceRoot, "contracts/managed/guardian");
const guardianAssetsRoute = "/contracts/managed/guardian";
const midnightJsUtilsEntry = path.resolve(
  workspaceRoot,
  "node_modules/@midnight-ntwrk/midnight-js-utils/dist/index.mjs"
);
const platformJsEntry = path.resolve(
  workspaceRoot,
  "node_modules/@midnight-ntwrk/platform-js/dist/esm/index.js"
);
const platformJsEffectDir = path.resolve(
  workspaceRoot,
  "node_modules/@midnight-ntwrk/platform-js/dist/esm/effect"
);

function platformEffectAlias(moduleName: string): { find: string; replacement: string } {
  return {
    find: `@midnight-ntwrk/platform-js/effect/${moduleName}`,
    replacement: path.resolve(platformJsEffectDir, `${moduleName}.js`),
  };
}

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith(".json")) return "application/json";
  if (filePath.endsWith(".js")) return "text/javascript";
  if (filePath.endsWith(".map")) return "application/json";
  return "application/octet-stream";
}

function copyDirectory(sourceDir: string, targetDir: string): void {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
  }
}

function guardianContractAssetsPlugin(): Plugin {
  return {
    name: "guardian-contract-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requestUrl = req.url?.split("?")[0] ?? "";
        if (!requestUrl.startsWith(guardianAssetsRoute)) {
          next();
          return;
        }

        // Let Vite transform JS module requests such as contract/index.js.
        // We only need custom serving for raw proof artifacts and metadata.
        if (requestUrl.includes("/contract/") || requestUrl.endsWith(".js") || requestUrl.endsWith(".js.map")) {
          next();
          return;
        }

        const relativePath = requestUrl.slice(guardianAssetsRoute.length).replace(/^\/+/, "");
        const resolvedPath = path.resolve(guardianAssetsDir, relativePath);

        if (!resolvedPath.startsWith(guardianAssetsDir)) {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }

        if (!fs.existsSync(resolvedPath) || fs.statSync(resolvedPath).isDirectory()) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }

        res.setHeader("Content-Type", contentTypeFor(resolvedPath));
        fs.createReadStream(resolvedPath).pipe(res);
      });
    },
    writeBundle(options) {
      const outDir = options.dir ?? "dist";
      copyDirectory(
        guardianAssetsDir,
        path.resolve(workspaceRoot, outDir, "contracts/managed/guardian")
      );
    },
  };
}

export default defineConfig({
  plugins: [
    guardianContractAssetsPlugin(),
    nodePolyfills({
      include: ["buffer", "process", "util", "stream", "events"],
      globals: { Buffer: true, process: true, global: true },
    }),
    wasm(),
    react(),
  ],
  envPrefix: "VITE_",
  resolve: {
    alias: [
      { find: /^@midnight-ntwrk\/midnight-js-utils$/, replacement: midnightJsUtilsEntry },
      platformEffectAlias("CoinPublicKey"),
      platformEffectAlias("Configuration"),
      platformEffectAlias("ContractAddress"),
      platformEffectAlias("DomainSeparator"),
      platformEffectAlias("Hex"),
      platformEffectAlias("IntegerRange"),
      platformEffectAlias("NetworkId"),
      platformEffectAlias("NetworkIdMoniker"),
      platformEffectAlias("ParseError"),
      platformEffectAlias("SigningKey"),
      {
        find: "@midnight-ntwrk/platform-js/effect",
        replacement: path.resolve(platformJsEffectDir, "index.js"),
      },
      {
        find: "@midnight-ntwrk/platform-js/effect/index",
        replacement: path.resolve(platformJsEffectDir, "index.js"),
      },
      { find: /^@midnight-ntwrk\/platform-js$/, replacement: platformJsEntry },
    ],
    // Force single instances of these packages to prevent Symbol identity issues
    dedupe: [
      "@midnight-ntwrk/compact-js",
      "@midnight-ntwrk/compact-runtime",
      "@midnight-ntwrk/midnight-js-contracts",
      "@midnight-ntwrk/midnight-js-types",
      "@midnight-ntwrk/midnight-js-utils",
      "@midnight-ntwrk/platform-js",
      "effect",
    ],
  },
  optimizeDeps: {
    // Pre-bundle these so Vite doesn't split them across chunks
    include: [
      "@midnight-ntwrk/compact-js",
      "@midnight-ntwrk/compact-runtime",
      "@midnight-ntwrk/midnight-js-contracts",
      "@midnight-ntwrk/midnight-js-types",
      "effect",
    ],
    exclude: [
      "@midnight-ntwrk/ledger-v8",
      "@midnight-ntwrk/onchain-runtime-v3",
    ],
  },
  build: {
    rollupOptions: {
      external: [
        "@midnight-ntwrk/ledger-v8",
        "@midnight-ntwrk/onchain-runtime-v3",
        "@midnight-ntwrk/midnight-js-node-zk-config-provider",
      ],
    },
  },
});
