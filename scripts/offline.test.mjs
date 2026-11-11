import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { buildWorker } from "./service-worker.mjs";

test("ordinary Web generator uses the verified common policy and defers optional art", async () => {
  const dir = mkdtempSync(join(tmpdir(), "statify-sw-"));
  try {
    const web = join(dir, "output/build/app");
    mkdirSync(join(web, "assets"), { recursive: true });
    writeFileSync(join(web, "index.html"), "synthetic HTML");
    for (const name of [
      "main-1.js",
      "main-1.css",
      "theme-1.webp",
      "hud-frame.webp",
    ])
      writeFileSync(join(web, "assets", name), name);
    execFileSync(process.execPath, [resolve("scripts/offline.mjs")], {
      cwd: dir,
      env: { ...process.env, STATIFY_WEB_DIR: web, VITE_STATIFY_REGION: "cn" },
      windowsHide: true,
    });
    const source = readFileSync(join(web, "sw.js"), "utf8");
    assert.equal(
      source,
      await buildWorker({
        directory: web,
        namespace: "life-rpg-",
        paths: [
          "index.html",
          "assets/main-1.js",
          "assets/main-1.css",
          "assets/hud-frame.webp",
        ],
      }),
    );
    assert(!source.includes("theme-1.webp"));
    writeFileSync(join(web, "index.html"), "changed stable HTML");
    assert.notEqual(
      source,
      await buildWorker({
        directory: web,
        namespace: "life-rpg-",
        paths: [
          "index.html",
          "assets/main-1.js",
          "assets/main-1.css",
          "assets/hud-frame.webp",
        ],
      }),
    );
  } finally {
    // The sole newly created mkdtemp directory, never a project or user-data path.
    rmSync(dir, { recursive: true, force: true });
  }
});
