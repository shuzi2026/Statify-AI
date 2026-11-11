import type Dexie from "dexie";
import type { EntityTable } from "dexie";
import type { StoredText } from "./registered-storage";

export type PreferenceStatus =
  | "value"
  | "missing"
  | "invalid"
  | "unavailable"
  | "legacy-changed"
  | "shared-legacy"
  | "ambiguous";
export type PreferenceRead<T> = { status: PreferenceStatus; value: T };
export type Definition<T> = {
  fallback: T;
  source: () => StoredText[];
  decode: (raw: (string | null)[]) => T | undefined;
  valid: (value: unknown) => value is T;
};
type RecordValue = {
  version: 1;
  scope: string;
  data: unknown;
  original: (string | null)[];
  source: (string | null)[];
};
type Database = Dexie & {
  preferences: EntityTable<{ id: string; value: unknown }, "id">;
};
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Only the committed database value is authoritative. Legacy sources are kept
 * untouched as recovery evidence, never maintained as a second write target. */
export function createPreferenceRepository<T extends Record<string, unknown>>(
  db: Database,
  definitions: { [K in keyof T]: Definition<T[K]> },
  scope: string,
  canMigrate: () => Promise<boolean | "shared-legacy">,
) {
  const cache = new Map<keyof T, PreferenceRead<T[keyof T]>>();
  const listeners = new Set<() => void>();
  let generation = 0;
  const id = (key: keyof T) => `device-preference:${String(key)}`;
  const emit = () => {
    for (const fn of listeners) {
      try {
        fn();
      } catch {}
    }
  };
  const source = (key: keyof T) => {
    const values = definitions[key].source();
    return values.some((v) => v.status === "unavailable")
      ? undefined
      : values.map((v) => v.value);
  };
  const valid = (key: keyof T, value: unknown): value is RecordValue => {
    const row = value as RecordValue | null;
    return (
      !!row &&
      row.version === 1 &&
      row.scope === scope &&
      definitions[key].valid(row.data) &&
      Array.isArray(row.original) &&
      Array.isArray(row.source) &&
      [row.original, row.source].every(
        (a) =>
          a.length === definitions[key].source().length &&
          a.every((v) => v === null || typeof v === "string"),
      )
    );
  };
  function read<K extends keyof T>(key: K): PreferenceRead<T[K]> {
    const saved = cache.get(key);
    if (saved) return saved as PreferenceRead<T[K]>;
    const raw = source(key);
    const value = raw && definitions[key].decode(raw);
    return {
      status: raw
        ? value === undefined
          ? "invalid"
          : raw.every((v) => v === null)
            ? "missing"
            : "value"
        : "unavailable",
      value: value === undefined ? definitions[key].fallback : value,
    };
  }
  async function refresh() {
    const request = ++generation;
    const results = new Map<keyof T, PreferenceRead<T[keyof T]>>();
    const allowed = await canMigrate().catch(() => false);
    for (const key of Object.keys(definitions) as (keyof T)[]) {
      const fallback = definitions[key].fallback;
      try {
        const result = await db.transaction(
          "rw",
          db.preferences,
          async (): Promise<PreferenceRead<T[keyof T]>> => {
            const target = await db.preferences.get(id(key));
            if (allowed === "shared-legacy") {
              if (!target) return { status: "shared-legacy", value: fallback };
              return valid(key, target.value)
                ? { status: "value", value: target.value.data as T[keyof T] }
                : { status: "invalid", value: fallback };
            }
            const raw = source(key);
            if (target) {
              if (!valid(key, target.value))
                return { status: "invalid", value: fallback };
              return {
                status:
                  raw === undefined
                    ? "unavailable"
                    : same(raw, target.value.source)
                      ? "value"
                      : "legacy-changed",
                value: target.value.data as T[keyof T],
              };
            }
            if (!raw) return { status: "unavailable", value: fallback };
            const decoded = definitions[key].decode(raw);
            if (decoded === undefined)
              return { status: "invalid", value: fallback };
            if (!allowed && raw.some((v) => v !== null))
              return { status: "ambiguous", value: fallback };
            if (!raw.length) return { status: "missing", value: decoded };
            // Rechecked inside this transaction: another page cannot interleave a migration.
            await db.preferences.put({
              id: id(key),
              value: {
                version: 1,
                scope,
                data: decoded,
                original: raw,
                source: raw,
              } satisfies RecordValue,
            });
            return { status: "value", value: decoded };
          },
        );
        results.set(key, result);
      } catch {
        const value = allowed === "shared-legacy"
          ? cache.get(key)?.value ?? fallback
          : read(key).value;
        results.set(key, { status: "unavailable", value });
      }
    }
    if (request !== generation) return;
    for (const [key, value] of results) cache.set(key, value);
    emit();
  }
  async function write<K extends keyof T>(
    key: K,
    value: T[K],
    guard?: (current: T[K]) => void,
  ): Promise<"saved" | "invalid" | "unavailable"> {
    if (!definitions[key].valid(value)) return "invalid";
    ++generation;
    try {
      const shared = await canMigrate().catch(() => false) === "shared-legacy";
      await db.transaction("rw", db.preferences, async () => {
        const target = await db.preferences.get(id(key));
        if (target && !valid(key, target.value))
          throw Error("Unsupported preference record");
        const raw = shared ? definitions[key].source().map(() => null) : source(key);
        // A denied source read cannot acknowledge an unknown legacy change.
        if (!raw) throw Error("Preference source is unavailable");
        const previous = target?.value as RecordValue | undefined;
        const current = (previous?.data ??
          definitions[key].decode(raw) ??
          definitions[key].fallback) as T[K];
        guard?.(current);
        await db.preferences.put({
          id: id(key),
          value: {
            version: 1,
            scope,
            data: value,
            original: previous?.original ?? raw,
            source: raw,
          } satisfies RecordValue,
        });
        guard?.(current);
      });
    } catch (error) {
      // Policy guards have their own typed result; never disguise them as storage failure.
      if (error instanceof PreferenceDenied) throw error;
      cache.set(key, { ...read(key), status: "unavailable" });
      emit();
      return "unavailable";
    }
    // The commit is already a fact even if the subsequent read fails. Keep its
    // value so a readback failure cannot revive an unclaimed free theme choice.
    cache.set(key, { status: "value", value });
    emit();
    // Read back after committing: a later transaction may already have won.
    await refresh();
    return "saved";
  }
  return {
    read,
    refresh,
    write,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
export class PreferenceDenied extends Error {}
