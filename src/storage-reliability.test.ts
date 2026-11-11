import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  db,
  load,
  readState,
  mutate,
  importSave,
  backup,
  recoveryBackup,
} from "./storage";
import { fresh, newCard } from "./model";
import { packState } from "./storage-format";

beforeEach(async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  await db.delete();
  await db.open();
});
afterEach(async () => {
  await db.delete();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("returned drafts cannot change committed cache data without a transaction", async () => {
  const initial = await load();
  initial.profile.name = "not saved";
  expect((await readState()).profile.name).toBe("朋友");
  const { state } = await mutate((s) => {
    s.cards = [
      {
        ...newCard(Date.now()),
        name: "saved",
        rewards: [{ id: s.attributes[0].id, amount: 12 }],
      },
    ];
  });
  state.cards[0].rewards[0].amount = 999;
  state.preferences.earlyCompletion = "record";
  expect((await readState()).cards[0].rewards[0].amount).toBe(12);
  expect((await readState()).preferences.earlyCompletion).toBe("ask");
  await mutate((s) => {
    s.profile.age = 30;
  });
  db.close();
  await db.open();
  expect((await readState()).cards[0].rewards[0].amount).toBe(12);
});

it("rejects duplicate template IDs before a valid in-memory import collapses into one database row", async () => {
  await load();
  const state = fresh(Date.now(), "cn"),
    card = { ...newCard(Date.now()), name: "first" };
  state.cardTemplates = [card, { ...card, name: "another" }];
  await expect(importSave(JSON.stringify(state))).rejects.toThrow(/重复/);
  expect(await db.backups.count()).toBe(0);
  expect((await readState()).cardTemplates).toEqual([]);
});

it("unknown database layouts are preserved for recovery instead of downgraded to layout 2", async () => {
  const state = fresh(Date.now(), "cn");
  await db.saves.put({ id: "main", layout: 99, revision: 7, data: state });
  await expect(load()).rejects.toThrow(/版本|格式/);
  expect((await db.saves.get("main"))?.layout).toBe(99);
  expect(JSON.parse(await recoveryBackup()).main).toEqual({
    id: "main",
    layout: 99,
    revision: 7,
    data: state,
  });
});

it("a failed import restores every table, backup head and owner before retry", async () => {
  await load();
  await mutate((s) => {
    s.profile.name = "saved";
    s.cards = [{ ...newCard(Date.now()), name: "saved" }];
  });
  await db.preferences.put({ id: "global-sync-owner", value: "old" });
  const before = await Promise.all(db.tables.map((t) => t.toArray()));
  const good = await backup();
  vi.spyOn(db.preferences, "put").mockRejectedValueOnce(
    Error("owner write failed"),
  );
  await expect(
    importSave(good, { source: "cloud", cloudOwner: "new" }),
  ).rejects.toThrow("owner write failed");
  expect(await Promise.all(db.tables.map((t) => t.toArray()))).toEqual(before);
  await importSave(good, { source: "cloud", cloudOwner: "new" });
  expect((await db.preferences.get("global-sync-owner"))?.value).toBe("new");
});

it("stale revisions cannot replace a newer device save or create import backups", async () => {
  await load();
  const text = await backup(),
    revision = (await db.saves.get("main"))!.revision;
  await mutate((s) => {
    s.profile.name = "newer";
  });
  const count = await db.backups.count();
  await expect(
    importSave(text, { expectedRevision: revision, source: "cloud" }),
  ).rejects.toThrow(/changed/);
  expect((await readState()).profile.name).toBe("newer");
  expect(await db.backups.count()).toBe(count);
});

it("rejects duplicate history identity before writes and leaves recovery evidence intact", async () => {
  await load();
  const raw = packState(fresh(Date.now(), "cn"));
  raw.rows.changes = [
    { id: "same", position: 0, data: { id: "same", at: 1, text: "first" } },
    { id: "same", position: 1, data: { id: "same", at: 2, text: "second" } },
  ];
  await expect(
    importSave(
      JSON.stringify({ format: "statify-backup", formatVersion: 2, data: raw }),
    ),
  ).rejects.toThrow(/重复/);
  expect(await db.backups.count()).toBe(0);
});
