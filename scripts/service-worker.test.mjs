import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import { generateWorker } from "./service-worker.mjs";

const files = [
  {
    url: "index.html",
    sha256: createHash("sha256").update("shell").digest("hex"),
  },
];
test("worker revision includes stable file bytes and cache namespace", () => {
  const first = generateWorker({ namespace: "cn-", files });
  assert.notEqual(first, generateWorker({ namespace: "global-", files }));
  assert.notEqual(
    first,
    generateWorker({
      namespace: "cn-",
      files: [{ url: "index.html", sha256: "a".repeat(64) }],
    }),
  );
  assert.throws(() =>
    generateWorker({
      namespace: "cn-",
      files: [{ ...files[0], url: "../index.html" }],
    }),
  );
});

function harness() {
  const handlers = {},
    stores = new Map();
  let quota = false,
    offline = false;
  const scope = "https://local.example/mainland/";
  const key = (request) =>
    typeof request === "string" ? request : request.url;
  const caches = {
    has: async (name) => stores.has(name),
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const map = stores.get(name);
      return {
        match: async (request) => map.get(key(request))?.clone(),
        keys: async () => [...map.keys()].map((url) => ({ url })),
        delete: async (request) => map.delete(key(request)),
        put: async (request, response) => {
          if (quota) throw Error("quota");
          map.set(key(request), response.clone());
        },
      };
    },
  };
  runInNewContext(generateWorker({ namespace: "test-", files }), {
    self: {
      registration: { scope },
      clients: { matchAll: async () => [] },
      addEventListener: (type, handler) => {
        handlers[type] = handler;
      },
    },
    caches,
    URL,
    Response,
    Request,
    AbortController,
    crypto: webcrypto,
    setTimeout,
    clearTimeout,
    fetch: async () => {
      if (offline) throw Error("offline");
      return new Response("shell");
    },
  });
  return {
    stores,
    quota(value) {
      quota = value;
    },
    offline(value) {
      offline = value;
    },
    async event(type) {
      let result;
      handlers[type]({
        waitUntil(promise) {
          result = promise;
        },
      });
      await result;
    },
    async request(path, options) {
      let result;
      handlers.fetch({
        request: new Request(new URL(path, scope), options),
        respondWith(promise) {
          result = promise;
        },
      });
      return result;
    },
  };
}
test("private APIs, authenticated and query-bearing assets bypass every cache", async () => {
  const worker = harness();
  await worker.event("install");
  await worker.event("activate");
  for (const path of [
    "api/me",
    "cn-test/api/me",
    "global-test/api/me",
    "global-live/api/me",
    "../international/index.html",
    "assets/optional.svg?token=synthetic",
  ])
    assert.equal(await worker.request(path), undefined);
  assert.equal(
    await worker.request("index.html", {
      headers: { Authorization: "synthetic" },
    }),
    undefined,
  );
  assert.equal(await worker.request("api/save", { method: "POST" }), undefined);
});
test("quota failure removes candidate and never publishes a complete marker", async () => {
  const worker = harness();
  worker.quota(true);
  await assert.rejects(worker.event("install"), /quota/);
  assert.equal(worker.stores.size, 0);
});
test("optional image quota failure preserves successful network response and offline shell", async () => {
  const worker = harness();
  await worker.event("install");
  await worker.event("activate");
  worker.quota(true);
  assert.equal(
    await (await worker.request("assets/optional.svg")).text(),
    "shell",
  );
  worker.offline(true);
  assert.equal(
    await (await worker.request("index.html?keep=1")).text(),
    "shell",
  );
});
