import Dexie from "dexie";
import { isThemeId, type ThemeId } from "../themes/catalog";
import { platformCapabilities } from "../platform/runtime";
import {
  devicePreferenceSlots as slots,
  themeChoiceSlot,
} from "./registered-storage";
import {
  createPreferenceRepository,
  type Definition,
  type PreferenceRead,
  type PreferenceStatus,
} from "./preference-repository";

export type Preferences = {
  reducedEffects: boolean;
  cardFloating: boolean;
  cardFloatingOverride: boolean | null;
  cardLighting: boolean | null;
  planLayout: { ratio: number; manual: boolean };
  theme: ThemeId | null;
};
const bool = (raw: string | null, fallback: boolean) =>
  raw === null
    ? fallback
    : raw === "true"
      ? true
      : raw === "false"
        ? false
        : undefined;
const cardMotionOverride: Definition<boolean | null> = {
  fallback: null,
  source: () => [],
  decode: () => null,
  valid: (value): value is boolean | null =>
    value === null || typeof value === "boolean",
};
export const preferenceDefinitions: {
  [K in keyof Preferences]: Definition<Preferences[K]>;
} = {
  reducedEffects: {
    fallback: false,
    source: () => [slots.reducedEffects.read()],
    decode: ([raw]) => bool(raw, false),
    valid: (v): v is boolean => typeof v === "boolean",
  },
  cardFloating: {
    fallback: true,
    source: () => [slots.cardFloating.read()],
    decode: ([raw]) =>
      raw === null || raw === "on" ? true : raw === "off" ? false : undefined,
    valid: (v): v is boolean => typeof v === "boolean",
  },
  cardFloatingOverride: cardMotionOverride,
  cardLighting: cardMotionOverride,
  planLayout: {
    fallback: { ratio: 0.6, manual: false },
    source: () => [slots.planSplit.read(), slots.planSplitManual.read()],
    decode: ([raw, flag]) => {
      const ratio = raw === null ? 0.6 : Number(raw),
        manual = bool(flag, false);
      return ratio >= 0.25 && ratio <= 0.75 && manual !== undefined
        ? { ratio, manual: raw !== null && manual }
        : undefined;
    },
    valid: (v): v is Preferences["planLayout"] =>
      !!v &&
      typeof v === "object" &&
      "ratio" in v &&
      typeof v.ratio === "number" &&
      v.ratio >= 0.25 &&
      v.ratio <= 0.75 &&
      "manual" in v &&
      typeof v.manual === "boolean",
  },
  theme: {
    fallback: null,
    source: () => [themeChoiceSlot.read()],
    decode: ([raw]) => (raw === null ? null : isThemeId(raw) ? raw : undefined),
    valid: (v): v is ThemeId | null => v === null || isThemeId(v),
  },
};
type Repository = ReturnType<typeof createPreferenceRepository<Preferences>>;
let repository: Repository | undefined;
let opening: Promise<Repository> | undefined;
const listeners = new Set<() => void>();
type IssueStatus = Exclude<PreferenceStatus, "value" | "missing" | "shared-legacy">;
export type PreferenceIssue = {
  key: keyof Preferences;
  status: IssueStatus;
};
let issues: PreferenceIssue[] = [];
const update = () => {
  const next: PreferenceIssue[] = [];
  for (const key of Object.keys(preferenceDefinitions) as (keyof Preferences)[]) {
    const status = readPreference(key).status;
    if (status !== "value" && status !== "missing" && status !== "shared-legacy") {
      next.push(issues.find((issue) => issue.key === key && issue.status === status) ?? { key, status });
    }
  }
  if (
    next.length !== issues.length ||
    next.some((issue, i) => issue !== issues[i])
  ) issues = next;
  for (const fn of listeners) {
    try {
      fn();
    } catch {}
  }
};
export const subscribePreferences = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const preferenceIssues = () => issues;
let sharedLegacy = false;
export const usesSharedLegacyPreferences = () => sharedLegacy;
export function readPreference<K extends keyof Preferences>(
  key: K,
): PreferenceRead<Preferences[K]> {
  if (repository) return repository.read(key);
  const definition = preferenceDefinitions[key],
    raw = definition.source();
  const value = definition.decode(raw.map((v) => v.value));
  return {
    status: raw.some((v) => v.status === "unavailable")
      ? "unavailable"
      : value === undefined
        ? "invalid"
        : raw.every((v) => v.status === "missing")
          ? "missing"
          : "value",
    value: value === undefined ? definition.fallback : value,
  };
}
export async function initializePreferences() {
  if (!opening)
    opening = (async () => {
      const { db } = await import("../storage");
      const scope = platformCapabilities().data;
      const stamp = JSON.stringify([
        db.name,
        scope.region,
        scope.storagePrefix,
      ]);
      repository = createPreferenceRepository<Preferences>(
        db,
        preferenceDefinitions,
        stamp,
        async () => {
          // An invalid account endpoint blocks the transport, but it does not
          // change which local database owns a device preference.
          if (
            platformCapabilities().issues.some(
              (issue) => issue !== "unsupported-api-path",
            )
          )
            return false;
          if (scope.storagePrefix) return platformCapabilities().platform === "pwa";
          const other =
            scope.region === "cn" ? "Statify-global-0.2" : "LifeRPG-0.2";
          if (db.name !== (scope.region === "cn" ? "LifeRPG-0.2" : "Statify-global-0.2"))
            return false;
          sharedLegacy = (await Dexie.getDatabaseNames()).includes(other);
          return sharedLegacy ? "shared-legacy" : true;
        },
      );
      repository.subscribe(update);
      await repository.refresh();
      return repository;
    })();
  return opening;
}
export async function writePreference<K extends keyof Preferences>(
  key: K,
  value: Preferences[K],
  guard?: (current: Preferences[K]) => void,
) {
  const repo = await initializePreferences();
  const result = await repo.write(key, value, guard);
  if (result === "saved" && typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel("statify-device-preferences");
      try {
        channel.postMessage({ scope: platformCapabilities().data });
      } finally {
        channel.close();
      }
    } catch {
      /* Optional cross-tab notification cannot undo a committed choice. */
    }
  }
  return result;
}
export function connectPreferences() {
  const refresh = () => {
    void initializePreferences().then((repo) => repo.refresh());
  };
  const prefix = platformCapabilities().data.storagePrefix;
  const keys = [...Object.values(slots), themeChoiceSlot].map(
    (slot) => prefix + slot.identity,
  );
  const storage = (event: StorageEvent) => {
    if (event.key === null || keys.includes(event.key)) refresh();
  };
  const visible = () => {
    if (document.visibilityState === "visible") refresh();
  };
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel("statify-device-preferences");
    channel.onmessage = (event) => {
      if (
        JSON.stringify(event.data?.scope) ===
        JSON.stringify(platformCapabilities().data)
      )
        refresh();
    };
  } catch {}
  window.addEventListener("storage", storage);
  document.addEventListener("visibilitychange", visible);
  return () => {
    channel?.close();
    window.removeEventListener("storage", storage);
    document.removeEventListener("visibilitychange", visible);
  };
}
