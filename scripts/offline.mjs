import { writeFileSync, readdirSync } from "node:fs";
import { buildWorker } from "./service-worker.mjs";
import { resolve } from "node:path";
const webDir =
  process.env.STATIFY_WEB_DIR ||
  (process.env.VITE_STATIFY_HARDENED === "1"
    ? "output/build/beta-prep/web"
    : "output/build/app");
const cachePrefix =
  process.env.VITE_STATIFY_REGION === "global"
    ? `statify-global-${process.env.VITE_STATIFY_PAYMENT_ENV === "live" ? "live" : "sandbox"}-`
    : "life-rpg-";
// Structural frames are part of the offline UI. Character/background art stays on demand.
// Frames requested before the first worker takes control would otherwise miss its runtime cache.
const assets = [
  "./index.html",
  ...readdirSync(resolve(webDir, "assets"))
    .filter(
      (f) =>
        /\.(js|css)$/.test(f) ||
        /(S[A-Z](009|010|011|012|013)_|dialog-frame|hud-frame|button-blank|panel-portrait|paper-quiet).*\.(webp|png|svg)$/.test(
          f,
        ),
    )
    .map((f) => "./assets/" + f),
];
const worker = await buildWorker({
  directory: webDir,
  namespace: cachePrefix,
  paths: assets,
});
writeFileSync(resolve(webDir, "sw.js"), worker);
console.log("Verified offline shell generated:", webDir);
