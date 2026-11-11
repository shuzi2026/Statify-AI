import { afterEach, expect, it, vi } from "vitest";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
it("legacy records discard unknown fields and API grouping keeps distinct statuses", async () => {
  let data = JSON.stringify([
    {
      kind: "error",
      message: "password=PRIVATE_OLD",
      at: "2026-01-01T00:00:00.000Z",
      count: 1,
      body: "PRIVATE_BODY",
      account: "PRIVATE_ACCOUNT",
    },
  ]);
  vi.stubGlobal("sessionStorage", {
    getItem: () => data,
    setItem: (_key: string, value: string) => {
      data = value;
    },
  });
  const log = await import("./runtime-diagnostics");
  expect(data).not.toMatch(/PRIVATE_/);
  log.recordRuntimeIssue("api", "arbitrary", { status: 503, category: "http" });
  log.recordRuntimeIssue("api", "different private text", {
    status: 503,
    category: "http",
  });
  log.recordRuntimeIssue("api", "arbitrary", { status: 401, category: "http" });
  expect(log.runtimeIssues().find((row) => row.status === 503)?.count).toBe(2);
  expect(log.runtimeIssues().find((row) => row.status === 401)?.count).toBe(1);
  log.recordRuntimeIssue("api", new Error("PRIVATE_CONFIG"), {
    category: "configuration",
  });
  expect(
    log.runtimeIssues().some((row) => row.category === "configuration"),
  ).toBe(true);
  expect(data).not.toContain("PRIVATE_CONFIG");
});
it("does not persist credentials, personal text or URL query data from an error", async () => {
  const rows = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => rows.get(key),
    setItem: (key: string, value: string) => rows.set(key, value),
  });
  const log = await import("./runtime-diagnostics");
  log.recordRuntimeIssue(
    "error",
    new Error(
      "password=SYNTHETIC_SECRET user=synthetic@example.test profile=PRIVATE_NOTE https://example.test/?token=PRIVATE_TOKEN",
    ),
  );
  expect(JSON.stringify(log.runtimeIssues())).not.toMatch(
    /SYNTHETIC_SECRET|example.test|PRIVATE_NOTE|PRIVATE_TOKEN/,
  );
  expect([...rows.values()].join()).not.toMatch(
    /SYNTHETIC_SECRET|example.test|PRIVATE_NOTE|PRIVATE_TOKEN/,
  );
});
it("a throwing diagnostic subscriber cannot break application error handling", async () => {
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => {} });
  const log = await import("./runtime-diagnostics");
  log.subscribeRuntimeIssues(() => {
    throw Error("subscriber failed");
  });
  expect(() =>
    log.recordRuntimeIssue("error", "synthetic error"),
  ).not.toThrow();
});
