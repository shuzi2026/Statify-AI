import { ruleContext } from "./payments/access";
import "fake-indexeddb/auto";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  db,
  load,
  mutate,
  importSave,
  resetForTesting,
  recoveryBackup,
  backup,
  readState,
} from "./storage";
import { newCard } from "./model";
import { start, settle } from "./engine";
beforeEach(async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  await db.open();
  for (const table of db.tables) await table.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("a complete backup above the former 8MB cap can be restored", async () => {
  await load();
  await mutate((s) => {
    s.legacy = { original: "x".repeat(9 * 1024 * 1024) };
  });
  const raw = await backup();
  expect(raw.length).toBeGreaterThan(8 * 1024 * 1024);
  await expect(importSave(raw)).resolves.toMatchObject({
    legacy: { original: "x".repeat(9 * 1024 * 1024) },
  });
});
it("recovery exports the failing current save instead of unrelated legacy data", async () => {
  const data = await load();
  const raw = { ...data, profile: { ...data.profile, age: "broken" } };
  await db.saves.put({ id: "main", data: raw as any });
  vi.stubGlobal("localStorage", { getItem: () => '{"legacy":"wrong"}' });
  await expect(load()).rejects.toThrow();
  expect(JSON.parse(await recoveryBackup())).toEqual(raw);
  expect((await db.saves.get("main"))!.data).toEqual(raw);
});
it("import rejects quantity timer conflicts without replacing the current save", async () => {
  const data = await load(),
    a = { ...newCard(Date.now()), name: "数量", method: "quantity" as const },
    b = { ...newCard(Date.now()), name: "计时", method: "timed" as const };
  data.cards = [a, b];
  const action = (card: typeof a | typeof b) => ({
    id: crypto.randomUUID(),
    card,
    startedAt: Date.now(),
    elapsed: 0,
    runningSince: Date.now(),
    endedAt: null,
    status: {},
    coefficient: 1,
    plans: [],
  });
  data.actions = [action(a), action(b)];
  const before = await db.saves.get("main");
  await expect(importSave(JSON.stringify(data))).rejects.toThrow(/多个计时/);
  expect(await db.saves.get("main")).toEqual(before);
  expect(await db.backups.count()).toBe(0);
});
it("concurrent transactions settle the same identity once", async () => {
  await load();
  let id = "";
  await mutate((s) => {
    s.cards.push({
      ...newCard(Date.now()),
      name: "one",
      rewards: [{ id: s.attributes[0].id, amount: 10 }],
    });
    id = start(s, s.cards[0].id, Date.now());
  });
  const fn = () =>
    mutate((s) =>
      settle(s, id, {
        seconds: 0,
        quantity: 1,
        rating: 1,
        counted: true,
        note: "",
      }, ruleContext(Date.now())),
    );
  await Promise.all([fn(), fn()]);
  const state = await readState();
  expect(state.entries).toHaveLength(1);
  expect(state.attributes[0].earned).toBe(10);
});
it("invalid import leaves current data intact and valid import backs it up", async () => {
  const s = await load();
  await expect(importSave('{"bad":true}')).rejects.toThrow();
  expect((await db.saves.get("main"))?.data.profile.name).toBe(s.profile.name);
  s.profile.name = "imported";
  await importSave(JSON.stringify(s));
  expect((await db.saves.get("main"))?.data.profile.name).toBe("imported");
  expect(await db.backups.count()).toBe(2);
});
it("failed mutation rolls all changes back", async () => {
  await load();
  await expect(
    mutate((s) => {
      s.profile.name = "changed";
      throw Error("fail");
    }),
  ).rejects.toThrow("fail");
  expect((await db.saves.get("main"))?.data.profile.name).toBe("朋友");
});
it("test reset starts fresh without creating a backup and never remigrates legacy", async () => {
  await load();
  await mutate((s) => {
    s.profile = { name: "old player", age: 30, onboarded: true };
    s.cards.push({ ...newCard(Date.now()), name: "old card" });
  });
  const old = (await db.saves.get("main"))!.data;
  await db.backups.add({
    id: "existing",
    at: 1,
    reason: "existing",
    raw: "preserve",
  });
  const next = await resetForTesting();
  expect(next.profile.onboarded).toBe(false);
  expect(next.cards).toHaveLength(0);
  expect(next.createdAt).toBeGreaterThan(old.createdAt);
  const backups = await db.backups.toArray();
  expect(backups).toHaveLength(1);
  expect(backups.find((b) => b.id === "existing")!.raw).toBe("preserve");
  vi.stubGlobal("localStorage", { getItem: () => "{invalid legacy" });
  expect((await load()).profile.onboarded).toBe(false);
});
it("failed reset write keeps the active save unchanged", async () => {
  await load();
  await mutate((s) => {
    s.profile.name = "keep me";
  });
  const spy = vi
    .spyOn(db.saves, "put")
    .mockRejectedValueOnce(Error("write failed"));
  await expect(resetForTesting()).rejects.toThrow("write failed");
  expect((await db.saves.get("main"))!.data.profile.name).toBe("keep me");
  spy.mockRestore();
});
