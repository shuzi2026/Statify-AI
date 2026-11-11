import { beforeEach, afterEach, it, expect, vi } from "vitest";
beforeEach(() => {
  vi.resetModules();
  const data = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => data.get(key) || null,
    setItem: (key: string, value: string) => data.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());
it("bounds repeated errors and retains the current session after reloading the module", async () => {
  let log = await import("./runtime-diagnostics");
  const repeated = new Error("same failure");
  repeated.stack = "at http://localhost/src/example.ts:1:2";
  log.recordRuntimeIssue("error", repeated);
  log.recordRuntimeIssue("error", repeated);
  expect(log.runtimeIssues()).toHaveLength(1);
  expect(log.runtimeIssues()[0].count).toBe(2);
  vi.resetModules();
  log = await import("./runtime-diagnostics");
  expect(log.runtimeIssues()[0].message).toBe("Error · details omitted");
  for (let i = 0; i < 30; i++) {
    const error = new Error("omitted private text");
    error.stack = `at http://localhost/src/example-${i}.ts:1:2`;
    log.recordRuntimeIssue("async", error);
  }
  expect(log.runtimeIssues()).toHaveLength(20);
  expect(
    new Set(log.runtimeIssues().map((issue) => issue.fingerprint)).size,
  ).toBe(20);
  log.recordRuntimeIssue("startup", "x".repeat(10000));
  expect(log.runtimeIssues().at(-1)!.message.length).toBeLessThanOrEqual(2000);
});
it("records window errors and promise rejections without creating a UI banner, and disposes listeners", async () => {
  const target = new EventTarget();
  vi.stubGlobal("window", target);
  const log = await import("./runtime-diagnostics"),
    dispose = log.initializeRuntimeDiagnostics();
  target.dispatchEvent(
    Object.assign(new Event("error"), { message: "page issue" }),
  );
  target.dispatchEvent(
    Object.assign(new Event("unhandledrejection"), {
      reason: new Error("async issue"),
    }),
  );
  expect(log.runtimeIssues().map((item) => [item.kind, item.message])).toEqual([
    ["error", "Error · details omitted"],
    ["async", "Error · details omitted"],
  ]);
  dispose();
  target.dispatchEvent(
    Object.assign(new Event("error"), { message: "after dispose" }),
  );
  expect(log.runtimeIssues()).toHaveLength(2);
});
it("keeps feedback usable when session storage is unavailable", async () => {
  vi.stubGlobal("sessionStorage", {
    getItem() {
      throw Error("Storage blocked");
    },
    setItem() {
      throw Error("Storage blocked");
    },
  });
  const log = await import("./runtime-diagnostics");
  expect(() => log.recordRuntimeIssue("error", "memory-only")).not.toThrow();
  expect(log.runtimeIssues()[0].message).toBe("Error · details omitted");
});
it("multiple diagnostic owners record each event once and release only after the last owner", async () => {
  const target = new EventTarget(); vi.stubGlobal("window",target);
  const log = await import("./runtime-diagnostics");
  const a = log.initializeRuntimeDiagnostics(), b = log.initializeRuntimeDiagnostics();
  const fire = () => target.dispatchEvent(Object.assign(new Event("error"),{message:"synthetic"}));
  fire(); expect(log.runtimeIssues()[0].count).toBe(1);
  a(); fire(); expect(log.runtimeIssues()[0].count).toBe(2);
  b(); fire(); expect(log.runtimeIssues()[0].count).toBe(2);
});
