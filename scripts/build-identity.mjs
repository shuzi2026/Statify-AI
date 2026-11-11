import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createDiagnostics } from "../src/diagnostics-core.js";

// Source identity only: no Git identity, environment files, accounts or generated data.
export function sourceDigest(root) {
  const paths = [];
  function walk(dir) {
    for (const entry of readdirSync(resolve(root, dir), {
      withFileTypes: true,
    })) {
      const path = dir + "/" + entry.name;
      if (entry.isDirectory()) walk(path);
      else if (
        entry.isFile() &&
        /\.(?:tsx?|js|css|json)$/.test(path) &&
        !/\.test\./.test(path)
      )
        paths.push(path);
    }
  }
  for (const dir of ["src", "shared"]) walk(dir);
  paths.push(
    "package.json",
    "package-lock.json",
    "index.html",
    "vite.config.ts",
    "tsconfig.json",
    "scripts/build-identity.mjs",
    "scripts/assets.mjs",
    "scripts/i18n-plugin.mjs",
    "scripts/webview-compat.mjs",
    "scripts/service-worker.mjs",
    "scripts/offline.mjs",
    "preview.html",
    "scripts/ui-layout-server.mjs",
  );
  const hash = createHash("sha256");
  for (const path of paths.sort())
    hash
      .update(path + "\0")
      .update(readFileSync(resolve(root, path)))
      .update("\0");
  return hash.digest("hex");
}
export function createBuildIdentity({
  root,
  region = "cn",
  platform = "web-runtime",
  mode = "production",
  sourceHash = sourceDigest(root),
}) {
  const productVersion = JSON.parse(
    readFileSync(resolve(root, "package.json"), "utf8"),
  ).version;
  return {
    schema: 1,
    productVersion,
    region,
    platform,
    mode,
    buildId: `${productVersion}-${region}-${platform}-${randomUUID()}`,
    sourceHash,
    sourceScope:
      "client/shared/config/generators; excludes art bytes, native binary and environment secrets",
  };
}
export function buildIdentityPlugin(identity) {
  return {
    name: "statify-build-identity",
    config() {
      return {
        define: {
          __STATIFY_BUILD_IDENTITY__: JSON.stringify(identity),
          __STATIFY_BUILD_LABEL__: JSON.stringify(identity.buildId),
        },
      };
    },
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const code = `window.__statifyBuild=${JSON.stringify(identity)};window.__statifyDiagnostics=(${createDiagnostics.toString()})({buildId:window.__statifyBuild.buildId,region:window.__statifyBuild.region,storage:function(){return window.__statifyPwaSession||window.sessionStorage;}});`;
        return html.replace(
          "<head>",
          `<head><meta name="statify-build-id" content="${identity.buildId}"><script>${code}</script>`,
        );
      },
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "build-identity.json",
        source: JSON.stringify(identity),
      });
    },
  };
}
