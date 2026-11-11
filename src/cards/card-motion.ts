import { useSyncExternalStore } from "react";
import {
  readPreference,
  subscribePreferences,
  writePreference,
} from "../local-data/preferences";

type MotionKey = "cardFloatingOverride" | "cardLighting";
const listeners = new Set<() => void>();
const edits = new Map<MotionKey, { enabled: boolean }>();
const writes = new Map<MotionKey, Promise<boolean>>();

function enabled(key: MotionKey) {
  return edits.get(key)?.enabled ?? readPreference(key).value ??
    (!readPreference("reducedEffects").value &&
      (key === "cardLighting" || readPreference("cardFloating").value));
}

function publish() {
  const { dataset } = document.documentElement;
  dataset.reduceEffects = String(readPreference("reducedEffects").value);
  dataset.cardFloating = String(enabled("cardFloatingOverride"));
  dataset.cardLighting = String(enabled("cardLighting"));
  for (const listener of listeners) listener();
}

export function initializeCardMotion() {
  publish();
  return subscribePreferences(publish);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setCardMotion(key: MotionKey, next: boolean) {
  const edit = { enabled: next };
  edits.set(key, edit);
  publish();
  // Serialize rapid toggles of one switch. The newest choice remains visible
  // while older writes finish. A failed choice is local until retried or reloaded.
  const pending = (writes.get(key) ?? Promise.resolve()).then(async () => {
    const result = await writePreference(key, next);
    if (result === "saved" && edits.get(key) === edit) edits.delete(key);
    return result === "saved";
  }).finally(() => {
    if (writes.get(key) === pending) writes.delete(key);
    publish();
  });
  writes.set(key, pending);
  return pending;
}

export function useCardMotion(key: MotionKey) {
  const value = useSyncExternalStore(subscribe, () => enabled(key));
  return [value, (next: boolean) => void setCardMotion(key, next)] as const;
}
