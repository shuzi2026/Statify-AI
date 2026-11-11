import { afterEach, it, expect, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { cloneCompatible, installRuntimeCompatibility } from "./runtime-compat";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("interpolates missing offsets across leading and trailing keyframes", () => {
  const offsets: (number | null | undefined)[][] = [];
  class FakeElement {
    animate(frames: Keyframe[]) {
      const count = frames.filter((k) => typeof k.offset === "number").length;
      if (count > 0 && count < frames.length)
        throw new Error("Partial keyframes are not supported");
      offsets.push(frames.map((k) => k.offset));
      return { cancel() {} };
    }
    remove() {}
  }
  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("document", { createElement: () => new FakeElement() });
  installRuntimeCompatibility();
  const el = new FakeElement();
  el.animate([
    { opacity: 0 },
    { opacity: 0.2 },
    { opacity: 0.4, offset: 0.4 },
    { opacity: 0.7 },
    { opacity: 1 },
  ]);
  expect(offsets).toEqual([[0, 0.2, 0.4, 0.7, 1]]);
});
it("clones cycles, repeated references and non-JSON values without losing data", () => {
  const shared = { value: undefined, n: NaN, inf: Infinity },
    source: any = {
      shared,
      again: shared,
      date: new Date(123),
      map: new Map(),
      set: new Set([shared]),
      bytes: new Uint8Array([1, 2, 3]),
      regexp: /test/gi,
    };
  source.self = source;
  source.map.set(source, shared);
  const copy = cloneCompatible(source);
  expect(copy).not.toBe(source);
  expect(copy.self).toBe(copy);
  expect(copy.shared).toBe(copy.again);
  expect(copy.map.get(copy)).toBe(copy.shared);
  expect(copy.set.has(copy.shared)).toBe(true);
  expect(copy.date.getTime()).toBe(123);
  expect(copy.bytes).toEqual(source.bytes);
  copy.bytes[0] = 9;
  expect(source.bytes[0]).toBe(1);
  expect(copy.regexp.flags).toBe("gi");
  expect(copy.shared).toHaveProperty("value", undefined);
  expect(Number.isNaN(copy.shared.n)).toBe(true);
  expect(copy.shared.inf).toBe(Infinity);
});
it("does not invoke the __proto__ setter when copying stored objects", () => {
  const value = JSON.parse('{"__proto__":{"polluted":true}}');
  const copy = cloneCompatible(value);
  expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
  expect(Object.prototype.hasOwnProperty.call(copy, "__proto__")).toBe(true);
  expect(({} as any).polluted).toBeUndefined();
});
it("rejects uncloneable values", () => {
  expect(() => cloneCompatible(() => {})).toThrow();
  expect(() => cloneCompatible(Symbol("private"))).toThrow();
});
it("preserves sparse arrays and binary blobs", async () => {
  const sparse = new Array(3);
  sparse[1] = "saved";
  const copy = cloneCompatible(sparse);
  expect(copy.length).toBe(3);
  expect(0 in copy).toBe(false);
  expect(copy[1]).toBe("saved");
  const blob = new Blob(["backup"], { type: "text/plain" }),
    other = cloneCompatible(blob);
  expect(other).not.toBe(blob);
  expect(await other.text()).toBe("backup");
  expect(other.type).toBe("text/plain");
  expect(() => cloneCompatible(new WeakMap())).toThrow();
});
it("uses secure random bytes for RFC4122 UUIDs when randomUUID is missing", () => {
  const secure = vi.fn((value: Uint8Array<ArrayBuffer>) =>
    webcrypto.getRandomValues(value),
  );
  vi.stubGlobal("crypto", { getRandomValues: secure });
  installRuntimeCompatibility();
  const ids = new Set(Array.from({ length: 20 }, () => crypto.randomUUID()));
  expect(ids.size).toBe(20);
  for (const id of ids)
    expect(id).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
    );
  expect(secure).toHaveBeenCalledTimes(20);
});
it("leaves native implementations in place", () => {
  const clone = globalThis.structuredClone,
    uuid = crypto.randomUUID,
    timeout = AbortSignal.timeout;
  installRuntimeCompatibility();
  expect(globalThis.structuredClone).toBe(clone);
  expect(crypto.randomUUID).toBe(uuid);
  expect(AbortSignal.timeout).toBe(timeout);
});
it("a missing timeout API aborts requests instead of waiting forever", () => {
  vi.useFakeTimers();
  const original = Object.getOwnPropertyDescriptor(AbortSignal, "timeout")!;
  Object.defineProperty(AbortSignal, "timeout", {
    configurable: true,
    value: undefined,
  });
  try {
    installRuntimeCompatibility();
    const signal = AbortSignal.timeout(50);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(50);
    expect(signal.aborted).toBe(true);
    expect(() => AbortSignal.timeout(-1)).toThrow();
  } finally {
    Object.defineProperty(AbortSignal, "timeout", original);
  }
});
it("polyfills replaceChildren with remove-and-append behaviour when missing (Chrome 86+)", () => {
  const removed: number[] = [],
    appended: number[] = [];
  class FakeElement {
    children = [1, 2, 3];
    get firstChild() {
      return this.children.length ? this.children[0] : null;
    }
    removeChild(node: number) {
      expect(node).toBe(this.children[0]);
      removed.push(node);
      this.children.shift();
    }
    append(...nodes: number[]) {
      appended.push(...nodes);
    }
  }
  vi.stubGlobal("Element", FakeElement);
  try {
    installRuntimeCompatibility();
    expect(
      (FakeElement.prototype as unknown as { replaceChildren?: unknown })
        .replaceChildren,
    ).toBeTypeOf("function");
    const el = new FakeElement() as unknown as {
      replaceChildren: (...nodes: number[]) => void;
    };
    el.replaceChildren(7, 8);
    expect(removed).toEqual([1, 2, 3]);
    expect(appended).toEqual([7, 8]);
  } finally {
    vi.unstubAllGlobals();
  }
});
it("fills missing keyframe offsets when the engine rejects partial keyframes (Chrome <84)", () => {
  const calls: {
    keyframes: { opacity?: number; transform?: string; offset?: number }[];
    options: unknown;
  }[] = [];
  class FakeElement {
    animate(
      keyframes: { opacity?: number; transform?: string; offset?: number }[],
      options: unknown,
    ) {
      const present = keyframes.map((k) => typeof k.offset === "number");
      if (present.some(Boolean) && !present.every(Boolean))
        throw new DOMException(
          "Partial keyframes are not supported",
          "NotSupportedError",
        );
      calls.push({ keyframes, options });
      return { cancel() {} };
    }
  }
  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("document", { createElement: () => new FakeElement() });
  try {
    installRuntimeCompatibility();
    const el = new FakeElement() as unknown as {
      animate: (
        k: { opacity?: number; transform?: string; offset?: number }[],
        o: unknown,
      ) => void;
    };
    el.animate(
      [{ opacity: 0 }, { opacity: 0.5, offset: 0.5 }, { opacity: 1 }],
      { duration: 100 },
    );
    expect(calls.length).toBe(1);
    expect(calls[0].keyframes.map((k) => k.offset)).toEqual([0, 0.5, 1]);
    el.animate([{ opacity: 0 }, { opacity: 1 }], 200);
    expect(calls[1].keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  } finally {
    vi.unstubAllGlobals();
  }
});
