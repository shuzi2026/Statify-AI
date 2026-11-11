import { useState } from "react";
import { type Card, type Entry, type State } from "../model";
import { useAppTime } from "./useViewTime";
import { type CollectionId } from "../card-collection";
import type { Modal } from "./types";
import { accountBackend } from "../payments/deployment";

export function initialAppTab() {
  return accountBackend !== "none" && new URLSearchParams(location.search).has("payment")
    ? "settings"
    : "today";
}
export function useAppControls(
  s: State | null,
  initialAdjustmentUntil: number | null | undefined,
) {
  const now = useAppTime(s, initialAdjustmentUntil);
  const [error, E] = useState(""),
    [recoveryError, RecoveryError] = useState(""),
    [tab, T] = useState(initialAppTab),
    [modal, M] = useState<Modal | null>(null),
    [toast, Q] = useState(""),
    [collection, Collection] = useState<CollectionId>("all"),
    [homeCollection, HomeCollection] = useState<CollectionId>("all"),
    [saved, Save] = useState<Entry | null>(null);
  const [focusId, FocusId] = useState<string | null>(null),
    [createdCard, CreatedCard] = useState<Card | null>(null);
  const [inspected, Inspect] = useState<{
    id: string;
    source: HTMLElement;
  } | null>(null);
  return {
    error,
    E,
    recoveryError,
    RecoveryError,
    tab,
    T,
    modal,
    M,
    toast,
    Q,
    now,
    collection,
    Collection,
    homeCollection,
    HomeCollection,
    saved,
    Save,
    focusId,
    FocusId,
    createdCard,
    CreatedCard,
    inspected,
    Inspect,
  };
}
