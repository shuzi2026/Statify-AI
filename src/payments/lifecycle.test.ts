import { afterEach, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ callback: () => {}, remove: vi.fn() }));
vi.mock("./transport", () => ({
  onPaymentResume: (callback: () => void) => {
    native.callback = callback;
    return native.remove;
  },
}));
vi.mock("../runtime-diagnostics", () => ({ recordRuntimeIssue: vi.fn() }));
import { startAccountLifecycle } from "./lifecycle";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
it("offline loading precedes refresh and simultaneous resume events share one request", async () => {
  const events = new EventTarget(),
    doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("window", events);
  vi.stubGlobal("document", doc);
  let loaded!: () => void, refreshed!: () => void;
  const initialize = vi.fn(
    () =>
      new Promise<void>((r) => {
        loaded = r;
      }),
  );
  const refresh = vi.fn(
    () =>
      new Promise<void>((r) => {
        refreshed = r;
      }),
  );
  const dispose = vi.fn();
  const stop = startAccountLifecycle({ initialize, refresh, dispose });
  await flush();
  events.dispatchEvent(new Event("focus"));
  native.callback();
  expect(refresh).not.toHaveBeenCalled();
  loaded();
  await flush();
  for (const event of ["focus", "online", "pageshow"])
    events.dispatchEvent(new Event(event));
  doc.dispatchEvent(new Event("visibilitychange"));
  native.callback();
  await flush();
  expect(refresh).toHaveBeenCalledOnce();
  events.dispatchEvent(new Event("focus"));
  expect(refresh).toHaveBeenCalledOnce();
  stop();
  stop();
  refreshed();
  await flush();
  events.dispatchEvent(new Event("online"));
  doc.dispatchEvent(new Event("visibilitychange"));
  native.callback();
  await flush();
  expect(refresh).toHaveBeenCalledOnce();
  expect(dispose).toHaveBeenCalledOnce();
  expect(native.remove).toHaveBeenCalledOnce();
});
it("polling retains its read-only callback and is cleared on disposal", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("window", new EventTarget());
  const refresh = vi.fn(async () => {}),
    poll = vi.fn(async () => {});
  const stop = startAccountLifecycle({
    initialize: async () => {},
    refresh,
    poll,
    interval: 1000,
    dispose: () => {},
  });
  await flush();
  await vi.advanceTimersByTimeAsync(1000);
  expect(poll).toHaveBeenCalledOnce();
  expect(refresh).not.toHaveBeenCalled();
  stop();
  await vi.advanceTimersByTimeAsync(1000);
  expect(poll).toHaveBeenCalledOnce();
});
it("immediate disposal cancels queued initialization before any offline or online work starts", async () => {
  vi.stubGlobal("window", new EventTarget());
  const initialize = vi.fn(async () => {}),
    refresh = vi.fn(async () => {});
  const stop = startAccountLifecycle({
    initialize,
    refresh,
    dispose: () => {},
  });
  stop();
  await flush();
  expect(initialize).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
});
