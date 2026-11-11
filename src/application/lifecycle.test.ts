import { expect, it, vi } from "vitest";
import { createApplicationLifecycle, sharedService } from "./lifecycle";

function deferred() {
  let resolve!: () => void, reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};
function fixture() {
  const local = deferred(),
    stops: string[] = [];
  const prepare = vi.fn(() => () => {
    stops.push("shell");
  });
  const online = vi.fn(() => () => {
    stops.push("account");
  });
  const afterLocal = vi.fn(() => () => {
    stops.push("cloud");
  });
  const load = vi.fn(() => local.promise),
    report = vi.fn();
  const session = createApplicationLifecycle({
    prepare: [prepare],
    online: [online],
    afterLocal: [afterLocal],
    load,
    report,
  });
  return { session, local, prepare, online, afterLocal, stops, load, report };
}
it("one local load and one resource set serve repeated owners; final disposal is symmetric", async () => {
  const f = fixture();
  const first = f.session.start(),
    second = f.session.start();
  await flush();
  expect(f.load).toHaveBeenCalledOnce();
  expect(f.prepare).toHaveBeenCalledOnce();
  expect(f.online).toHaveBeenCalledOnce();
  expect(f.afterLocal).not.toHaveBeenCalled();
  f.local.resolve();
  await flush();
  expect(f.session.snapshot().phase).toBe("ready");
  expect(f.afterLocal).toHaveBeenCalledOnce();
  first();
  first();
  expect(f.stops).toEqual([]);
  second();
  expect(f.stops).toEqual(["cloud", "account", "shell"]);
});
it("optional failure never blocks local readiness or other online services", async () => {
  const stop = vi.fn(),
    report = vi.fn();
  const session = createApplicationLifecycle({
    prepare: [],
    load: async () => {},
    online: [
      () => {
        throw Error("offline");
      },
      () => stop,
    ],
    afterLocal: [],
    report,
  });
  const release = session.start();
  await flush();
  expect(session.snapshot().phase).toBe("ready");
  expect(report).toHaveBeenCalledOnce();
  release();
  expect(stop).toHaveBeenCalledOnce();
});
it("a disposed load cannot start cloud listeners or publish readiness", async () => {
  const f = fixture(),
    stop = f.session.start();
  await flush();
  stop();
  f.local.resolve();
  await flush();
  expect(f.afterLocal).not.toHaveBeenCalled();
  expect(f.session.snapshot().phase).toBe("idle");
});
it("dispose and immediate re-entry share an in-flight storage transaction, only the new session becomes ready", async () => {
  const f = fixture(),
    stop = f.session.start();
  await flush();
  stop();
  const next = f.session.start();
  f.local.resolve();
  await flush();
  expect(f.load).toHaveBeenCalledOnce();
  expect(f.afterLocal).toHaveBeenCalledOnce();
  expect(f.session.snapshot().phase).toBe("ready");
  next();
});
it("storage failure stays recoverable and a later new session can retry", async () => {
  const f = fixture(),
    stop = f.session.start();
  const failure = Error("disk unavailable");
  f.local.reject(failure);
  await flush();
  expect(f.session.snapshot()).toEqual({ phase: "failed", error: failure });
  expect(f.afterLocal).not.toHaveBeenCalled();
  stop();
  f.load.mockResolvedValueOnce();
  const next = f.session.start();
  await flush();
  expect(f.session.snapshot().phase).toBe("ready");
  next();
});
it("cleanup failures cannot leak the remaining owned resources", async () => {
  const clean = vi.fn(),
    report = vi.fn();
  const session = createApplicationLifecycle({
    prepare: [
      () => clean,
      () => () => {
        throw Error("dispose");
      },
    ],
    load: async () => {},
    online: [],
    afterLocal: [],
    report,
  });
  const stop = session.start();
  await flush();
  stop();
  expect(clean).toHaveBeenCalledOnce();
  expect(report).toHaveBeenCalledOnce();
});
it("shared services retain listeners until their final consumer releases and can restart", () => {
  const stop = vi.fn(),
    setup = vi.fn(() => stop),
    start = sharedService(setup);
  const a = start(),
    b = start();
  a();
  a();
  expect(setup).toHaveBeenCalledOnce();
  expect(stop).not.toHaveBeenCalled();
  b();
  const c = start();
  expect(setup).toHaveBeenCalledTimes(2);
  c();
  expect(stop).toHaveBeenCalledTimes(2);
});
