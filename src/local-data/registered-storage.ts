import type { State } from "../model";
import { currentDraftEpoch } from "./draft-epoch";

type Store = () => Storage;
export type StoredText =
  | { status: "value"; value: string }
  | { status: "missing" | "unavailable"; value: null };

// Keep these bindings lazy and bare: PWA builds replace them with scoped stores.
// No caller can supply an arbitrary key, prefix or alternative account store.
const local: Store = () => localStorage;
const session: Store = () => sessionStorage;
function slot(store: Store, identity: string) {
  return {
    identity,
    read(): StoredText {
      try {
        const value = store().getItem(identity);
        return value === null
          ? { status: "missing", value: null }
          : { status: "value", value };
      } catch {
        return { status: "unavailable", value: null };
      }
    },
    write(value: string): "saved" | "unavailable" {
      try {
        store().setItem(identity, value);
        return "saved";
      } catch {
        return "unavailable";
      }
    },
    remove(): "removed" | "unavailable" {
      try {
        store().removeItem(identity);
        return "removed";
      } catch {
        return "unavailable";
      }
    },
  };
}

export const devicePreferenceSlots = {
  reducedEffects: slot(local, "statify-reduce-effects"),
  cardFloating: slot(local, "statify-desktop-card-float"),
  planSplit: slot(local, "statify-plan-split"),
  planSplitManual: slot(local, "statify-plan-split-manual"),
};
const profileDraftPrefix = "life-rpg-profile-draft:";
const cardDraftPrefix = "life-rpg-card-draft:";
function draftSlot(store: Store, key: string) {
  const entry = slot(store, key), epoch = currentDraftEpoch();
  return {
    ...entry,
    identity: epoch === null ? entry.identity : entry.identity + ":epoch:" + epoch,
    read(): StoredText {
      const raw = entry.read();
      if (raw.status !== "value") return raw;
      try {
        const saved = JSON.parse(raw.value);
        if (saved?.draftEnvelope === 1)
          return saved.epoch === epoch && typeof saved.text === "string"
            ? { status: "value", value: saved.text } : { status: "missing", value: null };
      } catch {}
      return epoch === null ? raw : { status: "missing", value: null };
    },
    write(text: string): "saved" | "unavailable" {
      if (epoch !== currentDraftEpoch()) return "unavailable";
      return entry.write(epoch === null ? text : JSON.stringify({ draftEnvelope: 1, epoch, text }));
    },
  };
}
export const profileDraftSlot = (createdAt: number) =>
  draftSlot(local, profileDraftPrefix + createdAt);
export const cardDraftSlot = (createdAt: number) =>
  draftSlot(session, cardDraftPrefix + createdAt);
export const planChoiceSlot = (s: Pick<State, "region" | "createdAt">) =>
  draftSlot(local, "statify-late-plan-choice:" + s.region + ":" + s.createdAt);
export const chatVoiceSlot = (s: Pick<State, "region" | "createdAt">) =>
  draftSlot(local, "statify-ai-voice:" + s.region + ":" + s.createdAt);
export const chatHistorySlot = (s: Pick<State, "region" | "createdAt">) =>
  draftSlot(local, "statify-ai-chat:" + s.region + ":" + s.createdAt);
export const themeChoiceSlot = slot(local, "statify-ui-theme");
export const themePreviewSlot = slot(session, "statify-preview-theme");

// StorageEvent keys are native (prefixed), unlike the PWA adapter's getItem keys.
export function isThemeChoiceEventKey(key: string | null): boolean {
  return (
    key ===
    (import.meta.env.VITE_STATIFY_STORAGE_PREFIX || "") +
      themeChoiceSlot.identity
  );
}

/** Existing developer reset: current storage namespace, these two draft families only. */
export function clearCharacterDraftsForTesting(): "removed" | "unavailable" {
  try {
    // Preserve the old evaluation/order and stop-on-error behavior. Resetting the
    // character has already succeeded; this auxiliary cleanup cannot undo it.
    for (const [store, prefix] of [
      [local(), profileDraftPrefix],
      [session(), cardDraftPrefix],
    ] as const) {
      for (let i = store.length - 1; i >= 0; i--) {
        const key = store.key(i);
        if (key?.startsWith(prefix)) store.removeItem(key);
      }
    }
    return "removed";
  } catch {
    return "unavailable";
  }
}
