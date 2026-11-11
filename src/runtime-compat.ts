/** Install only missing APIs; the secure random source and signed account checks stay mandatory. */
export function cloneCompatible<T>(
  value: T,
  seen = new Map<object, unknown>(),
): T {
  if (typeof value === "function" || typeof value === "symbol")
    throw new DOMException("Value cannot be cloned", "DataCloneError");
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value) as T;
  let result: any;
  if (value instanceof Date) result = new Date(value.getTime());
  else if (value instanceof RegExp)
    result = new RegExp(value.source, value.flags);
  else if (typeof File !== "undefined" && value instanceof File)
    result = new File([value], value.name, {
      type: value.type,
      lastModified: value.lastModified,
    });
  else if (typeof Blob !== "undefined" && value instanceof Blob)
    result = value.slice(0, value.size, value.type);
  else if (value instanceof ArrayBuffer) result = value.slice(0);
  else if (ArrayBuffer.isView(value)) {
    const buffer = cloneCompatible(value.buffer, seen);
    result =
      value instanceof DataView
        ? new DataView(buffer, value.byteOffset, value.byteLength)
        : new (value.constructor as any)(
            buffer,
            value.byteOffset,
            (value as any).length,
          );
  } else if (value instanceof Map) {
    result = new Map();
    seen.set(value, result);
    for (const [key, item] of value)
      result.set(cloneCompatible(key, seen), cloneCompatible(item, seen));
    return result;
  } else if (value instanceof Set) {
    result = new Set();
    seen.set(value, result);
    for (const item of value) result.add(cloneCompatible(item, seen));
    return result;
  } else {
    if (
      value instanceof WeakMap ||
      value instanceof WeakSet ||
      value instanceof Promise ||
      (typeof Node !== "undefined" && value instanceof Node)
    )
      throw new DOMException("Value cannot be cloned", "DataCloneError");
    result = Array.isArray(value) ? new Array(value.length) : {};
    seen.set(value, result);
    for (const key of Object.keys(value))
      Object.defineProperty(result, key, {
        value: cloneCompatible((value as any)[key], seen),
        writable: true,
        enumerable: true,
        configurable: true,
      });
  }
  seen.set(value, result);
  return result as T;
}
export function installRuntimeCompatibility() {
  if (typeof queueMicrotask !== "function")
    (globalThis as Record<string, unknown>).queueMicrotask = (
      callback: () => void,
    ) => {
      void Promise.resolve().then(callback);
    };
  if (typeof Object.fromEntries !== "function")
    Object.defineProperty(Object, "fromEntries", {
      configurable: true,
      writable: true,
      value: (entries: Iterable<readonly [PropertyKey, unknown]>) => {
        const result: Record<PropertyKey, unknown> = {};
        for (const entry of entries) if (entry) result[entry[0]] = entry[1];
        return result;
      },
    });
  if (typeof Array.prototype.flatMap !== "function")
    Object.defineProperty(Array.prototype, "flatMap", {
      configurable: true,
      writable: true,
      value: function (
        callback: (value: unknown, index: number, array: unknown[]) => unknown,
        thisArg?: unknown,
      ) {
        return Array.prototype.concat.apply(
          [],
          this.map((value: unknown, index: number) =>
            callback.call(thisArg, value, index, this),
          ),
        );
      },
    });
  if (typeof Array.prototype.flat !== "function")
    Object.defineProperty(Array.prototype, "flat", {
      configurable: true,
      writable: true,
      value: function (depth?: number) {
        const level =
          depth === undefined ? 1 : Math.max(0, Math.floor(Number(depth)));
        const walk = (value: unknown, rest: number): unknown[] =>
          Array.isArray(value) && rest > 0
            ? Array.prototype.concat.apply(
                [],
                value.map((item: unknown) => walk(item, rest - 1)),
              )
            : [value];
        return Array.prototype.concat.apply(
          [],
          this.map((item: unknown) => walk(item, level)),
        );
      },
    });
  if (typeof String.prototype.matchAll !== "function")
    Object.defineProperty(String.prototype, "matchAll", {
      configurable: true,
      writable: true,
      value: function (regexp: RegExp) {
        const flags =
          regexp.flags.indexOf("g") >= 0 ? regexp.flags : regexp.flags + "g";
        const re = new RegExp(regexp.source, flags);
        const matches: RegExpMatchArray[] = [];
        let match: RegExpExecArray | null;
        while ((match = re.exec(this as string)) !== null) {
          matches.push(match as unknown as RegExpMatchArray);
          if (match.index === re.lastIndex) re.lastIndex++;
        }
        return matches.values();
      },
    });
  if (typeof globalThis.structuredClone !== "function")
    globalThis.structuredClone = ((
      value: unknown,
      options?: StructuredSerializeOptions,
    ) => {
      if (options?.transfer?.length)
        throw new DOMException(
          "Transfer is unavailable in this WebView",
          "DataCloneError",
        );
      return cloneCompatible(value);
    }) as typeof structuredClone;
  if (typeof crypto.randomUUID !== "function")
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      value: () => {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        const h = Array.from(bytes, (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("");
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
      },
    });
  if (typeof AbortSignal.timeout !== "function")
    Object.defineProperty(AbortSignal, "timeout", {
      configurable: true,
      value: (milliseconds: number) => {
        if (!Number.isSafeInteger(milliseconds) || milliseconds < 0)
          throw new RangeError("Invalid timeout");
        const controller = new AbortController(),
          timer = setTimeout(
            () =>
              controller.abort(
                new DOMException("Request timed out", "TimeoutError"),
              ),
            milliseconds,
          );
        controller.signal.addEventListener("abort", () => clearTimeout(timer), {
          once: true,
        });
        return controller.signal;
      },
    });
  if (typeof Array.prototype.at !== "function")
    Object.defineProperty(Array.prototype, "at", {
      configurable: true,
      writable: true,
      value: function (index: number) {
        const n = Math.trunc(index) || 0;
        return this[n < 0 ? this.length + n : n];
      },
    });
  if (typeof Object.hasOwn !== "function")
    Object.defineProperty(Object, "hasOwn", {
      configurable: true,
      writable: true,
      value: (value: object, key: PropertyKey) =>
        Object.prototype.hasOwnProperty.call(value, key),
    });
  if (
    typeof Element !== "undefined" &&
    typeof Element.prototype.replaceChildren !== "function"
  )
    Object.defineProperty(Element.prototype, "replaceChildren", {
      configurable: true,
      writable: true,
      value: function (this: Element, ...nodes: (Node | string)[]) {
        while (this.firstChild) this.removeChild(this.firstChild);
        for (const node of nodes)
          this.append(
            typeof node === "string" ? document.createTextNode(node) : node,
          );
      },
    });
  // Chrome <84 rejects keyframe arrays where only some keyframes carry an offset
  // ("Partial keyframes are not supported"). Fill missing offsets per the spec's
  // computed-offset algorithm (endpoints default to 0/1, interior nulls are evenly
  // spaced between the nearest specified offsets) so every animate() call is safe.
  if (
    typeof Element !== "undefined" &&
    typeof Element.prototype.animate === "function" &&
    typeof document !== "undefined"
  ) {
    let partialUnsupported = false;
    try {
      const probe = document.createElement("div");
      probe
        .animate([{ opacity: 0 }, { opacity: 1, offset: 1 }], { duration: 0 })
        .cancel();
      probe.remove();
    } catch {
      partialUnsupported = true;
    }
    if (partialUnsupported) {
      const native = Element.prototype.animate;
      const fixed = (keyframes: Keyframe[]): Keyframe[] => {
        const n = keyframes.length,
          specified = keyframes.map((k) => typeof k.offset === "number");
        if (!specified.some(Boolean) || specified.every(Boolean))
          return keyframes;
        const filled = keyframes.map((k) => ({ ...k }));
        if (!specified[0]) {
          filled[0].offset = 0;
          specified[0] = true;
        }
        if (!specified[n - 1]) {
          filled[n - 1].offset = 1;
          specified[n - 1] = true;
        }
        let anchor = 0;
        for (let i = 1; i < n - 1; i++) {
          if (specified[i]) {
            anchor = i;
            continue;
          }
          let next = i;
          while (!specified[next]) next++;
          const from = filled[anchor].offset as number,
            to = filled[next].offset as number,
            span = next - anchor;
          for (let j = i; j < next; j++)
            filled[j].offset = from + ((to - from) * (j - anchor)) / span;
          anchor = next;
          i = next - 1;
        }
        return filled;
      };
      Object.defineProperty(Element.prototype, "animate", {
        configurable: true,
        writable: true,
        value: function (
          this: Element,
          keyframes: Keyframe[] | PropertyIndexedKeyframes | null | undefined,
          options?: number | KeyframeAnimationOptions,
        ) {
          if (Array.isArray(keyframes))
            return native.call(this, fixed(keyframes), options as number);
          return native.call(
            this,
            keyframes as unknown as Keyframe[],
            options as number,
          );
        },
      });
      (globalThis as Record<string, unknown>).statifyAnimatePatched = true;
    }
  }
}
