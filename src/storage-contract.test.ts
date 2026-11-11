import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  db,
  load,
  readState,
  readRevision,
  mutate,
  importSave,
  backup,
  recoveryBackup,
  resetForTesting,
  exportBackup,
  confirmBackupExport,
  storageStatus,
} from "./storage";
import { download } from "./storage-files";
import { parseImport } from "./migrate";
import { packState, unpackState } from "./storage-format";

vi.mock("./storage-files", async (original) => ({
  ...(await original<typeof import("./storage-files")>()),
  download: vi.fn(async () => undefined),
}));
beforeEach(async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  vi.stubGlobal("window", new EventTarget());
  await db.delete();
  await db.open();
  await load();
});
afterEach(async () => {
  await db.delete();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
const contents = () => Promise.all(db.tables.map((t) => t.toArray()));

it.each(["layout", "schema"] as const)(
  "refuses replacing or resetting a future %s without losing raw recovery data",
  async (kind) => {
    const good = await backup(),
      row = (await db.saves.get("main"))!;
    if (kind === "layout") row.layout = 99;
    else row.data.version = "9.0.0";
    await db.saves.put(row);
    const before = await contents();
    await expect(importSave(good)).rejects.toThrow(/版本|格式/);
    await expect(resetForTesting()).rejects.toThrow(/版本|格式/);
    expect(await contents()).toEqual(before);
    expect(await recoveryBackup()).toContain(
      kind === "layout" ? '"layout":99' : "9.0.0",
    );
  },
);

it("keeps future-layout metadata and every raw entity in the recovery export", async () => {
  await db.saves.update("main", { layout: 99, revision: 42 });
  await db.entries.put({
    id: "future-row",
    position: 0,
    data: { future: "untouched" },
  });
  const raw = JSON.parse(await recoveryBackup());
  expect(raw.main).toMatchObject({ layout: 99, revision: 42 });
  expect(raw.rows.entries).toEqual([
    { id: "future-row", position: 0, data: { future: "untouched" } },
  ]);
});

it("rejects asynchronous mutations without committing or notifying", async () => {
  const listener = vi.fn();
  window.addEventListener("statify-save-committed", listener);
  const before = await contents();
  const asynchronous = async (s: Awaited<ReturnType<typeof readState>>) => {
    s.profile.name = "must roll back";
    await Promise.resolve();
    s.profile.age = 40;
  };
  // @ts-expect-error Runtime protection also rejects callers that bypass TypeScript.
  await expect(mutate(asynchronous)).rejects.toThrow(/同步|synchronous/);
  expect(await contents()).toEqual(before);
  expect(listener).not.toHaveBeenCalled();
});

it("two concurrent direct imports cannot silently replace each other", async () => {
  const state = await readState();
  const first = JSON.stringify({
    ...state,
    profile: { ...state.profile, name: "first" },
  });
  const second = JSON.stringify({
    ...state,
    profile: { ...state.profile, name: "second" },
  });
  const results = await Promise.allSettled([
    importSave(first),
    importSave(second),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect((await readState()).profile.name).toBe("first");
  expect(await db.backups.count()).toBe(2);
});

it("download dispatch alone does not count as a confirmed independent backup", async () => {
  await exportBackup();
  expect(download).toHaveBeenCalled();
  expect((await storageStatus()).exportDue).toBe(true);
});

it.each([-1, 0.5, null, "0"])(
  "rejects invalid packed ordering metadata %j before replacing the save",
  async (position) => {
    const packed = packState(await readState());
    packed.rows.attributes[0].position = position as number;
    await expect(
      importSave(
        JSON.stringify({
          format: "statify-backup",
          formatVersion: 2,
          data: packed,
        }),
      ),
    ).rejects.toThrow();
    expect(await db.backups.count()).toBe(0);
  },
);

it("rejects an unknown declared envelope instead of treating it as unversioned legacy", () => {
  expect(() =>
    parseImport({
      format: "statify-backup-next",
      profile: { name: "future" },
      events: [],
    }),
  ).toThrow(/版本|格式/);
});

it("rejects an oversized packed collection before reading or expanding its rows", async () => {
  const packed = packState(await readState());
  let reads = 0;
  packed.rows.actions = Array.from({ length: 101 }, (_, i) => ({
    id: String(i),
    get position() {
      reads++;
      return i;
    },
    get data() {
      reads++;
      return {};
    },
  }));
  expect(() => unpackState(packed)).toThrow();
  expect(reads).toBe(0);
});

it("rejects duplicate packed positions without inventing a new record order", async () => {
  const packed = packState(await readState());
  packed.rows.attributes[1].position = packed.rows.attributes[0].position;
  await expect(
    importSave(
      JSON.stringify({
        format: "statify-backup",
        formatVersion: 2,
        data: packed,
      }),
    ),
  ).rejects.toThrow(/排序/);
  expect(await db.backups.count()).toBe(0);
});

it.each(["manual", "cloud"] as const)(
  "a concurrent %s import wins once while the other reviewed revision is rejected",
  async (first) => {
    const expectedRevision = await readRevision(),
      state = await readState();
    await db.preferences.put({ id: "global-sync-owner", value: "old-owner" });
    const text = (name: string) =>
      JSON.stringify({ ...state, profile: { ...state.profile, name } });
    const manual = () => importSave(text("manual"), { expectedRevision });
    const cloud = () =>
      importSave(text("cloud"), {
        expectedRevision,
        source: "cloud",
        cloudOwner: "cloud-owner",
        guard: () => {},
      });
    const order = first === "manual" ? [manual, cloud] : [cloud, manual];
    const results = await Promise.allSettled(order.map((fn) => fn()));
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
    expect((await readState()).profile.name).toBe(first);
    expect(await readRevision()).toBe(expectedRevision + 1);
    expect(await db.backups.count()).toBe(2);
    expect((await db.preferences.get("global-sync-owner"))?.value).toBe(
      first === "cloud" ? "cloud-owner" : "old-owner",
    );
    await mutate((s) => {
      s.profile.age = 40;
    });
    expect((await readState()).profile).toMatchObject({ name: first, age: 40 });
  },
);

it("a failed pre-import backup aborts the entire replacement before any notification", async () => {
  const raw = await backup(),
    before = await contents(),
    listener = vi.fn();
  window.addEventListener("statify-save-committed", listener);
  vi.spyOn(db.backupHeads, "put").mockRejectedValueOnce(
    new DOMException("full", "QuotaExceededError"),
  );
  await expect(importSave(raw)).rejects.toThrow(/本次更改未保存/);
  expect(await contents()).toEqual(before);
  expect(listener).not.toHaveBeenCalled();
});

it("a read failure never creates a new empty save or changes recovery data", async () => {
  const before = await contents();
  vi.spyOn(db.saves, "get").mockRejectedValueOnce(Error("read interrupted"));
  await expect(load()).rejects.toThrow("read interrupted");
  expect(await contents()).toEqual(before);
  expect((await readState()).profile.name).toBe("朋友");
});

it("a cancelled handoff and an old unconfirmed export do not reset the reminder", async () => {
  await db.preferences.put({ id: "lastExport", value: Date.now() });
  expect((await storageStatus()).exportDue).toBe(true);
  vi.mocked(download).mockRejectedValueOnce(Error("share cancelled"));
  await expect(exportBackup()).rejects.toThrow("share cancelled");
  expect((await storageStatus()).exportDue).toBe(true);
  expect(await db.preferences.get("lastConfirmedExport")).toBeUndefined();
});

it("only explicit external-file confirmation refreshes the reminder, and stale confirmations cannot regress it", async () => {
  const at = Date.now();
  await exportBackup();
  expect((await storageStatus()).exportDue).toBe(true);
  await confirmBackupExport(at);
  expect((await storageStatus()).exportDue).toBe(false);
  await confirmBackupExport(at - 86400000);
  expect((await db.preferences.get("lastConfirmedExport"))?.value).toBe(at);
  vi.spyOn(Date, "now").mockReturnValue(at + 7 * 86400000 + 1);
  expect((await storageStatus()).exportDue).toBe(true);
});
