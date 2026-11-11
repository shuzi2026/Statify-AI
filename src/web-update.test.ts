import { afterEach, describe, expect, it, vi } from "vitest";
import { createUpdateMonitor } from "./web-update";
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const worker = Object.assign(new EventTarget(), { state: "installing" });
  const registration = Object.assign(new EventTarget(), {
    active: {} as ServiceWorker,
    waiting: null as ServiceWorker | null,
    installing: null as ServiceWorker | null,
    update: vi.fn(async () => registration),
  });
  const asRegistration = registration as unknown as ServiceWorkerRegistration;
  function state(next: string) {
    worker.state = next;
    worker.dispatchEvent(new Event("statechange"));
  }
  function found() {
    registration.installing = worker as unknown as ServiceWorker;
    registration.dispatchEvent(new Event("updatefound"));
  }
  return { worker, registration, asRegistration, state, found };
}
describe("update monitor never adopts a candidate or touches application state", () => {
  it("the entry reuses early registration and can restart monitoring after HMR without registering twice", async () => {
    const f = fixture();
    const register = vi.fn(async () => f.asRegistration);
    vi.stubGlobal("window", {__statifyWorkerRegistration:Promise.resolve(f.asRegistration)});
    vi.stubGlobal("navigator", {serviceWorker:{register}});
    vi.stubGlobal("location", {protocol:"http:"});
    const updates = await import("./web-update");
    updates.initializeWebUpdates(); updates.initializeWebUpdates();
    await Promise.resolve();
    expect(updates.webUpdates.snapshot()).toBe("idle");
    updates.disposeWebUpdates(); updates.initializeWebUpdates(); await Promise.resolve();
    await updates.webUpdates.check();
    expect(f.registration.update).toHaveBeenCalledOnce();
    expect(register).not.toHaveBeenCalled();
    updates.disposeWebUpdates();
  });
  it("a check finishing after disposal cannot attach a worker listener", async () => {
    const f = fixture(), monitor = createUpdateMonitor();
    await monitor.start(Promise.resolve(f.asRegistration));
    let resolve!: (value: typeof f.registration) => void;
    f.registration.update.mockImplementation(() => new Promise(r => { resolve = r; }));
    const pending = monitor.check();
    const attach = vi.spyOn(f.worker, "addEventListener");
    monitor.dispose();
    f.registration.installing = f.worker as unknown as ServiceWorker;
    resolve(f.registration);
    await pending;
    expect(attach).not.toHaveBeenCalled();
  });
  it("out-of-order registration results cannot replace a newer observed registration", async () => {
    const first = fixture(), second = fixture(), monitor = createUpdateMonitor();
    let resolve!: (value: ServiceWorkerRegistration) => void;
    const old = monitor.start(new Promise(r => { resolve = r; }));
    await monitor.start(Promise.resolve(second.asRegistration));
    resolve(first.asRegistration);
    await old;
    await monitor.check();
    expect(second.registration.update).toHaveBeenCalledOnce();
    expect(first.registration.update).not.toHaveBeenCalled();
    monitor.dispose();
  });
  it("stops observing a superseded worker so its late events cannot overwrite the new state", async () => {
    const f = fixture(),
      monitor = createUpdateMonitor();
    await monitor.start(Promise.resolve(f.asRegistration));
    f.found();
    const next = Object.assign(new EventTarget(), { state: "installing" });
    f.registration.installing = next as unknown as ServiceWorker;
    f.registration.dispatchEvent(new Event("updatefound"));
    f.state("redundant");
    expect(monitor.snapshot()).toBe("downloading");
    next.state = "installed";
    next.dispatchEvent(new Event("statechange"));
    expect(monitor.snapshot()).toBe("ready");
    monitor.dispose();
    await monitor.check();
    expect(f.registration.update).not.toHaveBeenCalled();
  });
  it("re-registers after a failed first worker rather than updating a deleted registration", async () => {
    const f = fixture(),
      monitor = createUpdateMonitor();
    f.registration.active = null as unknown as ServiceWorker;
    const retry = vi.fn(async () => f.asRegistration);
    await monitor.start(Promise.resolve(f.asRegistration), retry);
    f.found();
    f.state("redundant");
    f.registration.installing = null;
    await monitor.check();
    expect(retry).toHaveBeenCalledOnce();
    expect(f.registration.update).not.toHaveBeenCalled();
  });
  it("reports download, waiting and failure without reload or activation", async () => {
    const f = fixture(),
      monitor = createUpdateMonitor();
    await monitor.start(Promise.resolve(f.asRegistration));
    expect(monitor.snapshot()).toBe("idle");
    f.found();
    expect(monitor.snapshot()).toBe("downloading");
    f.state("installed");
    expect(monitor.snapshot()).toBe("ready");
    f.state("redundant");
    expect(monitor.snapshot()).toBe("failed");
    monitor.dispose();
    f.state("activated");
    expect(monitor.snapshot()).toBe("failed");
  });
  it("deduplicates checks, preserves waiting updates on network failure", async () => {
    const f = fixture(),
      monitor = createUpdateMonitor();
    f.registration.waiting = f.worker as unknown as ServiceWorker;
    await monitor.start(Promise.resolve(f.asRegistration));
    expect(monitor.snapshot()).toBe("ready");
    f.registration.update.mockRejectedValue(Error("offline"));
    await Promise.all([monitor.check(), monitor.check()]);
    expect(f.registration.update).toHaveBeenCalledTimes(1);
    expect(monitor.snapshot()).toBe("ready");
  });
  it("reports offline check failure and supports a later successful retry", async () => {
    const f = fixture(),
      monitor = createUpdateMonitor();
    await monitor.start(Promise.resolve(f.asRegistration));
    f.registration.update.mockRejectedValueOnce(Error("offline"));
    await monitor.check();
    expect(monitor.snapshot()).toBe("failed");
    await monitor.check();
    expect(monitor.snapshot()).toBe("current");
  });
  it("registration failure can be retried; disposed registrations attach no listeners", async () => {
    const f = fixture(),
      monitor = createUpdateMonitor();
    await monitor.start(Promise.reject(Error("offline")), () =>
      Promise.resolve(f.asRegistration),
    );
    expect(monitor.snapshot()).toBe("failed");
    await monitor.check();
    expect(monitor.snapshot()).toBe("idle");
    monitor.dispose();
    await monitor.start(Promise.resolve(f.asRegistration));
    f.found();
    expect(monitor.snapshot()).toBe("idle");
  });
});
