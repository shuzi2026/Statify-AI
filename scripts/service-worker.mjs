import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function buildWorker({ directory, namespace, paths }) {
  let buildId = "legacy-unknown";
  try { buildId = JSON.parse(await readFile(resolve(directory, "build-identity.json"), "utf8")).buildId; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const files = [];
  for (const url of [...new Set(paths)].sort()) {
    const data = await readFile(resolve(directory, url));
    files.push({
      url,
      sha256: createHash("sha256").update(data).digest("hex"),
    });
  }
  return generateWorker({ namespace, files, buildId });
}

export function generateWorker({ namespace, files, buildId = "legacy-unknown" }) {
  files = files
    .map((file) => ({ ...file, url: file.url.replace(/^\.\//, "") }))
    .sort((a, b) => a.url.localeCompare(b.url));
  if (
    !files.some((file) => file.url === "index.html") ||
    files.some(
      (file) =>
        !/^[a-f0-9]{64}$/.test(file.sha256) ||
        /^(?:\/|[a-z]+:)|[?#]|(?:^|\/)\.\.(?:\/|$)/i.test(file.url),
    )
  )
    throw Error("Invalid offline manifest");
  const revision = createHash("sha256")
    .update(
      JSON.stringify({ namespace, files, buildId, policy: workerRuntime.toString() }),
    )
    .digest("hex")
    .slice(0, 20);
  return `(${workerRuntime.toString()})(${JSON.stringify({ namespace, revision, files, buildId })});\n`;
}

// Serialized into both Web/PWA workers. Keep this self-contained and chrome74-compatible.
function workerRuntime(config) {
  const scope = self.registration.scope;
  const base = new URL(scope);
  const prefix =
    config.namespace + "build-v2:" + encodeURIComponent(scope) + ":";
  const name = prefix + config.revision + ":shell";
  const marker = new URL("__statify_complete__", scope).href;
  const files = config.files.map((file) => ({
    url: new URL(file.url, scope).href,
    sha256: file.sha256,
  }));
  let runtimeWrites = Promise.resolve();

  async function complete(key) {
    if (!(await caches.has(key))) return null;
    const cache = await caches.open(key);
    const response = await cache.match(marker);
    if (!response) return null;
    try {
      const meta = await response.json();
      if (meta.scope !== scope || !Array.isArray(meta.files)) return null;
      const present = new Set(
        (await cache.keys()).map((request) => request.url),
      );
      if (!meta.files.every((file) => present.has(file.url))) return null;
      return { key, cache, meta };
    } catch {
      return null;
    }
  }
  async function previous() {
    const keys = (await caches.keys()).filter(
      (key) => key.startsWith(prefix) && key.endsWith(":shell") && key !== name,
    );
    const builds = (await Promise.all(keys.map(complete))).filter(Boolean);
    return builds
      .filter((build) => build.meta.activatedAt)
      .sort(
        (a, b) =>
          b.meta.activatedAt - a.meta.activatedAt || a.key.localeCompare(b.key),
      );
  }
  async function selected() {
    return (await complete(name)) || (await previous())[0];
  }
  async function discardSupersededCandidates() {
    for (const key of await caches.keys()) {
      if (!key.startsWith(prefix) || !key.endsWith(":shell") || key === name)
        continue;
      const build = await complete(key);
      if (build && build.meta.activatedAt) continue;
      await caches.delete(key);
      await caches.delete(key.slice(0, -6) + ":runtime");
    }
  }
  async function tell(type) {
    const clients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    for (const client of clients) {
      if (client.url.startsWith(scope))
        client.postMessage({ type, revision: config.revision });
    }
  }
  async function verified(file) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(
        new Request(file.url, {
          cache: "no-store",
          credentials: "omit",
          signal: controller.signal,
        }),
      );
      if (!response.ok || response.redirected) throw Error("Incomplete build");
      const bytes = await response.clone().arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const hash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      if (hash !== file.sha256) throw Error("Build content mismatch");
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
  self.addEventListener("install", (event) =>
    event.waitUntil(
      (async () => {
        if (await complete(name)) {
          await discardSupersededCandidates();
          return;
        }
        await caches.delete(name);
        try {
          const cache = await caches.open(name);
          for (const file of files)
            await cache.put(file.url, await verified(file));
          // No fetch handler uses a candidate until this final marker is committed.
          await cache.put(
            marker,
            new Response(
              JSON.stringify({
                scope,
                revision: config.revision,
                buildId: config.buildId,
                installedAt: Date.now(),
                files,
              }),
              { headers: { "Content-Type": "application/json" } },
            ),
          );
          await discardSupersededCandidates();
          await tell("STATIFY_UPDATE_READY");
        } catch (error) {
          await caches.delete(name);
          await tell("STATIFY_UPDATE_FAILED").catch(() => {});
          throw error;
        }
        // No skipWaiting: every existing tab keeps its original controller/build.
      })(),
    ),
  );
  self.addEventListener("activate", (event) =>
    event.waitUntil(
      (async () => {
        const current = await complete(name);
        if (!current) throw Error("Cannot activate an incomplete build");
        await current.cache.put(
          marker,
          new Response(
            JSON.stringify({
              ...current.meta,
              activatedAt: Date.now(),
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
        );
        const keep = new Set([
          name,
          ...(await previous()).slice(0, 1).map((build) => build.key),
        ]);
        for (const key of await caches.keys()) {
          if (!key.startsWith(prefix)) continue;
          const shell = key.endsWith(":runtime")
            ? key.slice(0, -8) + ":shell"
            : key;
          if (!keep.has(shell)) await caches.delete(key);
        }
        // Do not claim a page that loaded from the network or a previous controller.
      })(),
    ),
  );
  self.addEventListener("message", (event) => {
    if (
      event.data &&
      event.data.type === "STATIFY_BUILD_STATUS" &&
      event.ports[0]
    ) {
      event.waitUntil(
        selected().then((build) =>
          event.ports[0].postMessage({
            complete: !!build,
            revision: build ? build.meta.revision : null,
            buildId: build ? build.meta.buildId : null,
          }),
        ),
      );
    }
  });
  self.addEventListener("fetch", (event) => {
    const request = event.request,
      url = new URL(request.url);
    if (
      request.method !== "GET" ||
      url.origin !== base.origin ||
      !url.pathname.startsWith(base.pathname) ||
      request.headers.has("Authorization") ||
      /^\/admin(?:\/|$)/.test(url.pathname) ||
      /\/(?:api|cn-test\/api|global-(?:test|live)\/api)(?:\/|$)/.test(
        url.pathname,
      )
    )
      return;
    const entry =
      url.pathname === base.pathname ||
      url.pathname === base.pathname + "index.html";
    const essential =
      files.some((file) => file.url === url.origin + url.pathname) ||
      (url.pathname.startsWith(base.pathname + "assets/") &&
        /\.(?:js|css)$/.test(url.pathname));
    const picture =
      url.pathname.startsWith(base.pathname + "assets/") &&
      /\.(?:png|webp|jpe?g|svg|gif|woff2?)$/i.test(url.pathname);
    if ((!entry && url.search) || (!entry && !essential && !picture)) return;
    event.respondWith(
      (async () => {
        const build = await selected();
        if (!build) return Response.error();
        const key = entry
          ? new URL("index.html", scope).href
          : url.origin + url.pathname;
        const cached = await build.cache.match(key);
        if (cached) return cached;
        // A missing required resource may never be replaced by another deployment.
        if (!picture) return Response.error();
        const runtimeName = build.key.slice(0, -6) + ":runtime";
        const runtime = await caches.open(runtimeName);
        const image = await runtime.match(key);
        if (image) return image;
        try {
          const response = await fetch(request);
          if (!response.ok || response.redirected) return response;
          runtimeWrites = runtimeWrites
            .catch(() => {})
            .then(async () => {
              await runtime.put(key, response.clone());
              const keys = await runtime.keys();
              for (const old of keys.slice(0, Math.max(0, keys.length - 64)))
                await runtime.delete(old);
            });
          await runtimeWrites.catch(() => {}); // Optional art quota failures do not break online use.
          return response;
        } catch {
          return Response.error();
        }
      })(),
    );
  });
}
