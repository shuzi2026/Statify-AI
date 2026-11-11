import type { State } from "./model";
import { recordRuntimeIssue } from "./runtime-diagnostics";
import { currentDraftEpoch, isRemoteDraftEpoch } from "./local-data/draft-epoch";

/** A live lineage advances on local edits; replacing/externally refreshing a save
 * creates a new lineage even when the imported character has the same ID. */
export type SaveScope = {
  readonly database: string;
  readonly draftEpoch: string | null;
  revision: number;
};
export type SaveSnapshot = {
  state: State;
  revision: number;
  scope: SaveScope;
};
export type SaveSource =
  "load" | "mutation" | "import" | "cloud" | "reset" | "refresh";
let snapshot: SaveSnapshot | null = null;
const listeners = new Set<() => void>();
export const saveSnapshot = () => snapshot;
export const subscribeSave = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function safely(fn: () => void) {
  try {
    fn();
  } catch (error) {
    recordRuntimeIssue("error", error);
  }
}
function notify() {
  for (const listener of listeners) safely(listener);
}
export function clearSaveSnapshot() {
  snapshot = null;
  notify();
}

/** Only called after a successful IndexedDB transaction. Notification failures
 * cannot turn an already committed operation into a failed/retryable write. */
export function publishSave(
  state: State,
  revision: number,
  database: string,
  source: SaveSource,
  changed = true,
) {
  if (snapshot?.scope.database === database && revision <= snapshot.revision)
    return;
  const scope =
    source === "mutation" && snapshot?.scope.database === database
      ? snapshot.scope
      : { database, revision, draftEpoch: currentDraftEpoch() };
  scope.revision = revision;
  snapshot = { state, revision, scope };
  notify();
  if (!changed || source === "refresh" || typeof window === "undefined") return;
  safely(() =>
    window.dispatchEvent(
      new Event(
        source === "cloud"
          ? "statify-cloud-restored"
          : "statify-save-committed",
      ),
    ),
  );
  safely(() => {
    const channel = new BroadcastChannel("life-rpg-refresh");
    try {
      channel.postMessage({ type: "changed", database, revision });
    } finally {
      channel.close();
    }
  });
}
export class SaveConflict extends Error {
  constructor(scope?: SaveScope) {
    const current = snapshot?.scope;
    super(
      scope &&
        current?.database === scope.database &&
        current.draftEpoch !== scope.draftEpoch &&
        isRemoteDraftEpoch(current.draftEpoch)
        ? "当前存档已在其他设备发生变化，本次更改未保存。请核对当前内容后重试。"
        : "当前存档已更新，本次更改未保存。请核对当前内容后重试。",
    );
  }
}
export function assertSaveScope(scope: SaveScope | undefined) {
  if (!scope || scope !== snapshot?.scope) throw new SaveConflict(scope);
}
