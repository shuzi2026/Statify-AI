import "fake-indexeddb/auto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  db,
  load,
  backup,
  importSave,
  readState,
  refreshState,
} from "../storage";
import { createApplication } from "../application/runtime";
import {
  registerSaveReplacement,
  ReplacementCancelled,
} from "../application/save-replacement";
import {
  currentDraftEpoch,
  acceptDraftEpoch,
  draftEpochKey,
} from "./draft-epoch";
import {
  cardDraftSlot,
  profileDraftSlot,
  planChoiceSlot,
} from "./registered-storage";
import { writeCardDraft, readCardDraft } from "../cards/draft";
import { newCard } from "../model";

let local: Map<string, string>, session: Map<string, string>;
let stop: (() => void) | undefined;
beforeEach(async () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.now());
  local = new Map();
  session = new Map();
  const store = (map: Map<string, string>) => ({
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => map.set(k, v),
    removeItem: (k: string) => map.delete(k),
  });
  vi.stubGlobal("localStorage", store(local));
  vi.stubGlobal("sessionStorage", store(session));
  await db.open();
  for (const table of db.tables) await table.clear();
  acceptDraftEpoch(null);
  await load();
});
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("cancelling replacement preserves the save, drafts and durable epoch with no backup writes", async () => {
  const state = await readState(),
    raw = await backup();
  const draft = { card: newCard(Date.now()), step: 2 };
  writeCardDraft(state, draft);
  stop = registerSaveReplacement(async () => false);
  await expect(createApplication().importSave(raw)).rejects.toBeInstanceOf(
    ReplacementCancelled,
  );
  expect(await readState()).toEqual(state);
  expect(readCardDraft(state)).toEqual(draft);
  expect(currentDraftEpoch()).toBeNull();
  expect(await db.backups.count()).toBe(0);
});
it("same-createdAt replacement invalidates every old draft even when cleanup is denied, and only accepts new-scope input after reload", async () => {
  const state = await readState(),
    raw = await backup();
  const oldCard = cardDraftSlot(state.createdAt),
    oldProfile = profileDraftSlot(state.createdAt),
    oldPlan = planChoiceSlot(state);
  oldCard.write("old card");
  oldProfile.write("old profile");
  oldPlan.write("old plan");
  vi.spyOn(localStorage, "removeItem").mockImplementation(() => {
    throw Error("denied");
  });
  vi.spyOn(sessionStorage, "removeItem").mockImplementation(() => {
    throw Error("denied");
  });
  await importSave(raw);
  expect((await readState()).createdAt).toBe(state.createdAt);
  const epoch = currentDraftEpoch();
  expect(epoch).not.toBeNull();
  for (const slot of [
    cardDraftSlot(state.createdAt),
    profileDraftSlot(state.createdAt),
    planChoiceSlot(state),
  ])
    expect(slot.read().status).toBe("missing");
  expect(oldCard.write("late old card")).toBe("unavailable");
  const card = { card: newCard(Date.now()), step: 2 };
  writeCardDraft(state, card, null);
  expect(readCardDraft(state)).toBeNull();
  writeCardDraft(state, card, epoch);
  expect(readCardDraft(state)).toEqual(card);
  acceptDraftEpoch(null);
  db.close();
  await db.open();
  await load();
  expect(currentDraftEpoch()).toBe(epoch);
  expect(readCardDraft(state)).toEqual(card);
  expect(await backup()).toBe(raw); // Device preferences and epoch never enter the backup.
});
it("a failed replacement transaction keeps the original input scope and all recovery rows unchanged", async () => {
  const raw = await backup(),
    state = await readState();
  cardDraftSlot(state.createdAt).write("keep input");
  const fail = () => {
    throw Error("synthetic quota");
  };
  db.preferences.hook("creating", fail);
  await expect(importSave(raw)).rejects.toThrow();
  db.preferences.hook("creating").unsubscribe(fail);
  expect(await backup()).toBe(raw);
  expect(currentDraftEpoch()).toBeNull();
  expect(cardDraftSlot(state.createdAt).read().value).toBe("keep input");
  expect(await db.backups.count()).toBe(0);
  expect(await db.preferences.get(draftEpochKey)).toBeUndefined();
});
it("confirmation does not weaken revision protection when another action commits while waiting", async () => {
  let answer!: (value: boolean) => void;
  stop = registerSaveReplacement(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );
  const app = createApplication(),
    raw = await backup();
  const replacing = app.importSave(raw);
  await vi.waitFor(() => expect(answer).toBeTypeOf("function"));
  const { mutate } = await import("../storage");
  await mutate((s) => {
    s.profile.name = "newer action";
  });
  answer(true);
  await expect(replacing).rejects.toThrow(/等待期间/);
  expect((await readState()).profile.name).toBe("newer action");
  expect(currentDraftEpoch()).toBeNull();
});
it("external same-database replacement does not silently discard this page's draft on refresh cancellation", async () => {
  const { saveSnapshot } = await import("../save-publication");
  const scope = saveSnapshot()!.scope;
  await db.transaction("rw", db.saves, db.preferences, async () => {
    await db.saves.update("main", { revision: scope.revision + 1 });
    await db.preferences.put({
      id: draftEpochKey,
      value: "synthetic-external-replacement",
    });
  });
  stop = registerSaveReplacement(async () => false);
  await refreshState();
  expect(currentDraftEpoch()).toBeNull();
  expect(saveSnapshot()!.scope).toBe(scope);
  stop();
  stop = registerSaveReplacement(async () => true);
  await refreshState();
  expect(currentDraftEpoch()).toBe("synthetic-external-replacement");
  expect(saveSnapshot()!.scope).not.toBe(scope);
});
it("new input after confirmation aborts the replacement transaction instead of discarding that input", async () => {
  let revision = 0;
  stop = registerSaveReplacement(
    async () => true,
    () => revision,
  );
  const raw = await backup();
  // This fires after the initial guard, while the transaction is still writing.
  const edit = () => {
    revision++;
  };
  db.backups.hook("creating", edit);
  await expect(createApplication().importSave(raw)).rejects.toThrow(/新的操作/);
  db.backups.hook("creating").unsubscribe(edit);
  expect(await backup()).toBe(raw);
  expect(currentDraftEpoch()).toBeNull();
  expect(await db.backups.count()).toBe(0);
});
