import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  db,
  load,
  readState,
  mutate,
  backup,
  importSave,
  lastWriteStats,
  recoveryBackup,
  resetForTesting,
  gzip,
  readImportFile,
  maxImportBytes,
} from "./storage";
import { packState, unpackState } from "./storage-format";
import * as storageFormat from "./storage-format";
import { fresh, newCard, type Entry } from "./model";
import { parseImport } from "./migrate";
import { start } from "./engine";
import * as engine from "./engine";
import { newPlan, savePlan, addPlanSlot } from "./planning";
beforeEach(async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  await db.open();
  for (const table of db.tables) await table.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const card = () => ({ ...newCard(Date.now()), name: "读书" });
const entry = (id: string, at = Date.now()): Entry => ({
  id,
  cardId: "book",
  name: "旧标题",
  method: "instant",
  startedAt: at,
  endedAt: at,
  date: "2026-10-14",
  seconds: 0,
  measured: 0,
  quantity: 1,
  counted: true,
  rating: 1,
  coefficient: 1,
  note: "",
  score: 1,
  plans: [],
  rewards: [],
  effects: [],
  values: [],
  legacy: false,
});
it("upgrades an actual v1 database atomically and keeps the original backup", async () => {
  await db.delete();
  const old = new Dexie(db.name);
  old.version(1).stores({ saves: "id", backups: "id,at" });
  await old.open();
  const s = fresh(Date.now(), "cn");
  s.cards = [card()];
  s.entries = [entry("past")];
  await old.table("saves").put({ id: "main", data: s });
  old.close();
  await db.open();
  const next = await load();
  expect(next.cards).toEqual(s.cards);
  expect(next.entries).toEqual(s.entries);
  expect((await db.saves.get("main"))?.layout).toBe(2);
  expect((await db.saves.get("main"))?.data.cards).toBeUndefined();
  expect(JSON.parse((await db.backups.get("migration-v2"))!.raw!)).toEqual(s);
  expect(await db.cards.count()).toBe(1);
  expect(await db.entries.count()).toBe(1);
  await load();
  expect(await db.backups.count()).toBe(1);
});
it("reuses card configuration between its live card and active action, preserving old versions on edit", async () => {
  await load();
  await mutate((s) => {
    s.cards = [card()];
    start(s, s.cards[0].id, Date.now());
  });
  expect(await db.versions.where("kind").equals("card").count()).toBe(1);
  const action = (await db.actions.toArray())[0];
  expect(action.data.card).toBeUndefined();
  const reference = action.data.cardVersionId;
  await mutate((s) => {
    s.cards[0].name = "新标题";
    s.cards[0].favorite = false;
  });
  expect(await db.versions.where("kind").equals("card").count()).toBe(2);
  expect((await readState()).actions[0].card.name).toBe("读书");
  expect((await readState()).cards[0].name).toBe("新标题");
  expect((await db.actions.toArray())[0].data.cardVersionId).toBe(reference);
  await mutate((s) => {
    s.actions = [];
  });
  expect(await db.versions.where("kind").equals("card").count()).toBe(1);
});
it("deduplicates repeated plan requirements and restores exact order and history", () => {
  const s = fresh(Date.now(), "cn");
  s.cards = [card()];
  s.planCycles = Array.from({ length: 40 }, (_, i) => ({
    id: "cycle-" + i,
    planId: "plan",
    key: String(i),
    start: 1,
    end: 3,
    startsAt: 1,
    mode: "cards",
    target: 1,
    cards: [{ id: s.cards[0].id, target: 2 }],
    scope: "repeat",
    period: "day",
    timeline: false,
    slots: [],
  }));
  const packed = packState(s);
  expect(packed.versions.filter((v) => v.kind === "plan")).toHaveLength(1);
  expect(
    new Set(packed.rows.planCycles.map((r) => r.data.planVersionId)).size,
  ).toBe(1);
  expect(unpackState(packed)).toEqual(s);
});
it("writes no historical rows when only the nickname changes, and one row when its note changes", async () => {
  await load();
  await mutate((s) => {
    s.entries = Array.from({ length: 10000 }, (_, i) => entry("history-" + i));
  });
  const before = await db.entries.get("history-9999"),
    write = vi.spyOn(db.entries, "bulkPut");
  const began = performance.now();
  await mutate((s) => {
    s.profile.name = "新名字";
  });
  const elapsed = performance.now() - began;
  expect(write).not.toHaveBeenCalled();
  expect(lastWriteStats.upserts).toBe(0);
  expect(await db.entries.get("history-9999")).toEqual(before);
  await mutate((s) => {
    s.entries.find((e) => e.id === "history-9999")!.note = "感悟";
  });
  expect(write).toHaveBeenCalledTimes(1);
  expect(write.mock.calls[0][0]).toHaveLength(1);
  expect(lastWriteStats.upserts).toBe(1);
  console.info(
    `10000 records: nickname mutation ${elapsed.toFixed(0)} ms; history writes 0; reflection writes 1`,
  );
});
it("starts an action without serializing unchanged historical rows", async () => {
  await load();
  await mutate((s) => {
    s.cards = [{ ...card(), id: "performance-timer", method: "timed" }];
    s.entries = Array.from({ length: 1000 }, (_, i) => entry("unchanged-" + i));
  });
  const history = (await readState()).entries;
  const write = vi.spyOn(db.entries, "bulkPut");
  const stringify = vi.spyOn(JSON, "stringify");
  await mutate((s) => start(s, "performance-timer", Date.now()));
  const historicalSerializations = stringify.mock.calls.filter(
    ([value]) => value?.id?.startsWith("unchanged-") && value?.data,
  ).length;
  stringify.mockRestore();
  expect(historicalSerializations).toBe(0);
  expect(write).not.toHaveBeenCalled();
  expect((await readState()).entries).toEqual(history);
  expect((await readState()).actions).toHaveLength(1);
});

it("reloads an unchanged save without serializing history, writing rows or creating a backup", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T12:00:00"));
  await load();
  const { state: before } = await mutate((s) => {
    s.profile.onboarded = true;
    s.entries = Array.from({ length: 1000 }, (_, i) => entry("reload-history-" + i));
    s.legacy = { records: [{ name: "preserved original" }] };
  });
  const header = await db.saves.get("main"),
    backups = await db.backups.count();
  db.close();
  await db.open();
  const write = vi.spyOn(db.entries, "bulkPut"),
    save = vi.spyOn(db.saves, "put"),
    stringify = vi.spyOn(JSON, "stringify");
  const next = await load();
  const historicalSerializations = stringify.mock.calls.filter(
    ([value]) => typeof value === "string" && value.startsWith("reload-history-"),
  ).length;
  stringify.mockRestore();
  expect(historicalSerializations).toBe(0);
  expect(next).toEqual(before);
  expect(Object.isFrozen((next.legacy as any).records[0])).toBe(true);
  expect(write).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  expect(await db.saves.get("main")).toEqual(header);
  expect(await db.backups.count()).toBe(backups);
  expect(lastWriteStats).toEqual({ upserts: 0, deletes: 0 });
});

it("does not create a revision or backup when rollover only changes object key order", async () => {
  await load();
  await mutate((s) => { s.profile.onboarded = true; });
  const header = await db.saves.get("main"),
    backups = await db.backups.count(),
    roll = engine.rollDays;
  vi.spyOn(engine, "rollDays").mockImplementationOnce((s, now) => {
    roll(s, now);
    s.profile = { onboarded: s.profile.onboarded, age: s.profile.age, name: s.profile.name };
  });
  await load();
  expect(await db.saves.get("main")).toEqual(header);
  expect(await db.backups.count()).toBe(backups);
});

it("rolls back startup rollover and its backup on failure, then persists it exactly once on retry", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T12:00:00"));
  await load();
  const { state: before } = await mutate((s) => {
    s.profile.onboarded = true;
    s.entries = [entry("rollover-history")];
    s.legacy = { preserved: "original" };
  });
  const header = (await db.saves.get("main"))!,
    days = await db.days.toArray(),
    backups = await db.backups.count();
  vi.setSystemTime(new Date("2026-10-15T12:00:00"));
  vi.spyOn(db.saves, "put").mockRejectedValueOnce(new Error("startup disk failure"));
  await expect(load()).rejects.toThrow("startup disk failure");
  expect(await db.saves.get("main")).toEqual(header);
  expect(await db.days.toArray()).toEqual(days);
  expect(await db.backups.count()).toBe(backups);
  expect(await readState()).toEqual(before);
  const next = await load();
  expect(next.days.map((d) => d.date)).toEqual(["2026-10-14", "2026-10-15"]);
  expect(next.entries).toEqual(before.entries);
  expect(next.legacy).toEqual(before.legacy);
  expect((await db.saves.get("main"))!.revision).toBe(header.revision! + 1);
  expect(await db.backups.count()).toBe(backups + 1);
  const saved = (await db.backups.get("daily:2026-10-15"))!;
  const raw = saved.raw ?? await readImportFile(new Blob([saved.compressed as BlobPart]), "daily.gz");
  expect(parseImport(JSON.parse(raw))).toEqual(before);
  db.close();
  await db.open();
  expect(await load()).toEqual(next);
  expect((await db.saves.get("main"))!.revision).toBe(header.revision! + 1);
  expect(await db.backups.count()).toBe(backups + 1);
});

it("persists a reminder becoming due on the same day without duplicating it on reload", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T12:00:00"));
  await load();
  const { state: before } = await mutate((s) => {
    s.profile.onboarded = true;
    s.cards = [{ ...card(), id: "book" }];
    savePlan(s, {
      ...newPlan(Date.now()), id: "startup-plan", period: "day",
      anchor: "2026-10-14", cards: [{ id: "book", target: 1, score: 1 }],
    }, Date.now(), true);
    addPlanSlot(s, "startup-plan", "book", "1", "13:00", Date.now());
  });
  expect(before.messages).toHaveLength(0);
  const revision = (await db.saves.get("main"))!.revision!;
  vi.setSystemTime(new Date("2026-10-14T13:01:00"));
  const next = await load();
  expect(next.days).toEqual(before.days);
  expect(next.messages).toHaveLength(1);
  expect(next.messages[0]).toMatchObject({ dueAt: new Date("2026-10-14T13:00:00").getTime(), read: false });
  expect((await db.saves.get("main"))!.revision).toBe(revision + 1);
  db.close();
  await db.open();
  expect((await load()).messages).toEqual(next.messages);
  expect((await db.saves.get("main"))!.revision).toBe(revision + 1);
});

it("persists nested history edits, order and deletion together, and rolls all of them back on failure", async () => {
  await load();
  const { state: before } = await mutate((s) => {
    s.entries = [entry("first"), entry("second"), entry("third")];
    s.entries[1].rewards = [
      {
        id: "attribute",
        name: "历史奖励",
        before: 0,
        after: 1,
        requested: 1,
        actual: 1,
        reason: "原始快照",
      },
    ];
  });
  const rows = await db.entries.toArray();
  const expected = structuredClone(before.entries).reverse();
  expected.pop();
  expected[1].rewards[0].actual = 2;
  const edit = () =>
    mutate((s) => {
      s.entries = structuredClone(expected);
    });
  vi.spyOn(db.saves, "put").mockRejectedValueOnce(
    new Error("final write failed"),
  );
  await expect(edit()).rejects.toThrow("final write failed");
  expect(await db.entries.toArray()).toEqual(rows);
  expect((await readState()).entries).toEqual(before.entries);
  await edit();
  db.close();
  await db.open();
  expect((await readState()).entries).toEqual(expected);
  expect(before.entries[1].rewards[0].actual).toBe(1);
  expect(await db.entries.get("first")).toBeUndefined();
});

it("does not expand history for a daily backup that already exists", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T12:00:00"));
  vi.stubGlobal("CompressionStream", undefined);
  await load();
  await mutate((s) => {
    s.profile.onboarded = true;
    s.entries = Array.from({ length: 1000 }, (_, i) => entry("daily-history-" + i));
  });
  const before = await readState();
  await mutate((s) => { s.profile.name = "first edit"; });
  const daily = (await db.backups.get("daily:2026-10-14"))!;
  expect(parseImport(JSON.parse(daily.raw!))).toEqual(before);
  const expand = vi.spyOn(storageFormat, "unpackState");
  await mutate((s) => { s.entries[999].note = "later reflection"; });
  // The editable draft still expands and validates; a discarded backup must not.
  expect(expand).toHaveBeenCalledTimes(1);
  expect(await db.backups.get(daily.id)).toEqual(daily);
  expect((await readState()).entries[999].note).toBe("later reflection");
  expect(parseImport(JSON.parse(daily.raw!)).entries[999].note).toBe("");
});

it("does not expand a backup before onboarding is complete", async () => {
  await load();
  const expand = vi.spyOn(storageFormat, "unpackState");
  await mutate((s) => { s.profile.name = "draft character"; });
  expect(expand).toHaveBeenCalledTimes(1);
  expect(await db.backups.count()).toBe(0);
  expect((await readState()).profile.name).toBe("draft character");
});

it("retains seven daily pre-change backups without deleting migration or import backups", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T12:00:00"));
  await load();
  await mutate((s) => {
    s.profile.onboarded = true;
    s.profile.name = "before";
  });
  await db.backups.put({
    id: "keep-original",
    at: 1,
    reason: "导入原件",
    kind: "import",
    raw: "original",
  });
  for (let day = 1; day <= 9; day++) {
    vi.setSystemTime(
      new Date(`2026-10-${String(day).padStart(2, "0")}T12:00:00`),
    );
    await mutate((s) => {
      s.profile.name = String(day);
    });
    await mutate((s) => {
      s.profile.age = 26;
    });
  }
  const rows = await db.backups.where("kind").equals("daily").toArray();
  expect(rows).toHaveLength(7);
  expect(await db.backups.get("daily:2026-10-01")).toBeUndefined();
  expect(await db.backups.get("keep-original")).toMatchObject({
    raw: "original",
  });
  const latest = await db.backups.get("daily:2026-10-09");
  const text =
    latest!.raw ??
    (await readImportFile(
      new Blob([latest!.compressed as BlobPart]),
      "daily.gz",
    ));
  expect(parseImport(JSON.parse(text)).profile.name).toBe("8");
});
it("compressed and old plain JSON backups both round-trip without losing history", async () => {
  await load();
  await mutate((s) => {
    s.cards = [card()];
    s.entries = [entry("past")];
    s.legacy = { original: "x".repeat(10000) };
  });
  const raw = await backup(),
    compressed = await gzip(raw);
  expect(compressed.size).toBeLessThan(new Blob([raw]).size);
  const decoded = await readImportFile(compressed, "backup.json.gz");
  const before = await readState();
  await importSave(decoded);
  expect(await readState()).toEqual(before);
  await importSave(JSON.stringify(before));
  expect(await readState()).toEqual(before);
});
it("rejects missing version references and unsupported format versions before changing data", async () => {
  await load();
  const before = await backup(),
    raw = JSON.parse(before);
  raw.formatVersion = 99;
  await expect(importSave(JSON.stringify(raw))).rejects.toThrow(/版本/);
  const s = fresh(Date.now(), "cn");
  s.cards = [card()];
  const packed = packState(s);
  packed.versions = [];
  await expect(
    importSave(
      JSON.stringify({
        format: "statify-backup",
        formatVersion: 2,
        data: packed,
      }),
    ),
  ).rejects.toThrow(/卡牌版本/);
  expect((await readState()).profile.name).toBe("朋友");
  expect(await db.backups.count()).toBe(0);
});
it("rolls back entity changes and metadata together if the final write fails", async () => {
  await load();
  await mutate((s) => {
    s.cards = [card()];
    s.entries = [entry("past")];
  });
  vi.spyOn(db.saves, "put").mockRejectedValueOnce(Error("disk full"));
  await expect(
    mutate((s) => {
      s.entries[0].note = "failed";
      s.cards = [];
    }),
  ).rejects.toThrow("disk full");
  expect((await readState()).entries[0].note).toBe("");
  expect((await readState()).cards).toHaveLength(1);
});
it("test reset removes old entities and unused versions while retaining backups", async () => {
  await load();
  await mutate((s) => {
    s.cards = [card()];
    s.entries = [entry("past")];
  });
  await db.backups.put({ id: "manual", at: 1, reason: "保留", raw: "old" });
  await resetForTesting();
  db.close();
  await db.open();
  const next = await readState();
  expect(next.cards).toHaveLength(0);
  expect(next.entries).toHaveLength(0);
  expect(await db.versions.count()).toBe(0);
  expect(await db.backups.get("manual")).toBeDefined();
});
it("protects orphaned entities and exports them instead of overwriting them with a fresh save", async () => {
  await db.entries.put({ id: "orphan", position: 0, data: entry("orphan") });
  await expect(load()).rejects.toThrow(/未覆盖数据/);
  expect(await db.entries.count()).toBe(1);
  const raw = JSON.parse(await recoveryBackup());
  expect(raw.rows.entries[0].id).toBe("orphan");
  expect(await db.saves.get("main")).toBeUndefined();
});
it("can import a valid backup over a damaged normalized save while retaining damaged raw data", async () => {
  await load();
  await mutate((s) => {
    s.cards = [card()];
  });
  const good = await backup();
  const row = (await db.saves.get("main"))!;
  row.data.profile.age = "broken";
  await db.saves.put(row);
  await expect(load()).rejects.toThrow();
  await importSave(good);
  expect((await readState()).profile.age).toBe(25);
  const damaged = (await db.backups.toArray()).find(
    (b) => b.reason === "导入前备份",
  )!;
  expect(JSON.parse(damaged.raw!).data.header.profile.age).toBe("broken");
});
it("rejects decompression beyond the import limit even when the compressed file is tiny", async () => {
  const file = await gzip("x".repeat(maxImportBytes + 1));
  expect(file.size).toBeLessThan(100000);
  await expect(readImportFile(file, "large.gz")).rejects.toThrow(
    /解压后的存档/,
  );
});

it("preserves the immutable legacy original and rejects in-place draft edits", async () => {
  await load();
  await mutate((s) => {
    s.legacy = { records: [{ name: "original" }] };
  });
  await expect(
    mutate((s) => {
      (s.legacy as any).records[0].name = "edited";
    }),
  ).rejects.toThrow();
  expect((await readState()).legacy).toEqual({
    records: [{ name: "original" }],
  });
});
it("quota failures explain retry and keep all committed data intact", async () => {
  await load();
  const failure = new Error("quota");
  failure.name = "QuotaExceededError";
  vi.spyOn(db.saves, "put").mockRejectedValueOnce(failure);
  await expect(
    mutate((s) => {
      s.profile.name = "unsaved";
    }),
  ).rejects.toThrow(/本次更改未保存/);
  expect((await readState()).profile.name).toBe("朋友");
});

it("reads an earlier normalized layout with inline cards and whole-card action versions", () => {
  const s = fresh(Date.now(), "cn");
  s.cards = [card()];
  start(s, s.cards[0].id, Date.now());
  const packed = packState(s);
  packed.rows.cards = [{ id: s.cards[0].id, position: 0, data: s.cards[0] }];
  packed.versions.find((v) => v.kind === "card")!.data = s.cards[0];
  delete packed.rows.actions[0].data.cardRuntime;
  const restored = parseImport({
    format: "statify-backup",
    formatVersion: 2,
    data: packed,
  });
  expect(restored.cards).toEqual(s.cards);
  expect(restored.actions[0].card).toEqual(s.actions[0].card);
});
