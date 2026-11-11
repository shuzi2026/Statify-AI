import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fixture from "../tests/fixtures/storage-baseline.json";
import {
  db,
  load,
  readState,
  mutate,
  importSave,
  backup,
  backupFile,
  listBackups,
  recoveryBackup,
} from "./storage";
import { gzip, readImportFile } from "./storage-files";
import { parseImport, validateState } from "./migrate";
import { collections } from "./storage-format";

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

it.each(["plain", "packed", "gzip"] as const)(
  "preserves every modeled field from the old engine through %s import, export and reopen",
  async (kind) => {
    const source =
      kind === "plain"
        ? fixture.expected
        : { format: "statify-backup", formatVersion: 2, data: fixture.packed };
    const raw = JSON.stringify(source),
      text = kind === "gzip" ? await readImportFile(await gzip(raw)) : raw;
    await importSave(text);
    expect(await readState()).toEqual(fixture.expected);
    expect(parseImport(JSON.parse(await backup()))).toEqual(fixture.expected);
    db.close();
    await db.open();
    expect(await readState()).toEqual(fixture.expected);
    const original = (await db.backups.toArray()).find(
      (row) => row.reason === "导入原文件",
    );
    expect(original?.raw).toBe(text);
  },
);

it("normalizes 0.2.1 defaults exactly as the original implementation without losing existing fields", async () => {
  await importSave(JSON.stringify(fixture.v021));
  expect(await readState()).toEqual(fixture.v021Expected);
  expect(parseImport(JSON.parse(await backup()))).toEqual(fixture.v021Expected);
});

it("migrates 0.1 once, keeps its complete raw payload and active timer, and does not replay rewards", async () => {
  vi.spyOn(Date, "now").mockReturnValue(fixture.at);
  const raw = JSON.stringify(fixture.legacy);
  vi.stubGlobal("localStorage", { getItem: () => raw });
  const state = await load(),
    expected = structuredClone(fixture.legacyExpected);
  expected.actions[0].id = state.actions[0].id;
  expect(state).toEqual(expected);
  expect(state.entries[0].rewards).toEqual([]);
  expect(state.attributes[0].earned).toBe(321);
  expect(state.legacy).toEqual(fixture.legacy);
  expect((await db.backups.get("legacy-v3"))?.raw).toBe(raw);
  expect(await load()).toEqual(state);
  expect(await db.backups.count()).toBe(1);
  expect(localStorage.getItem("life-rpg-v3")).toBe(raw);
});

it("keeps all v1 data and the raw original when an upgrade write fails, then retries successfully", async () => {
  await db.delete();
  const old = new Dexie(db.name);
  old.version(1).stores({ saves: "id", backups: "id,at" });
  await old.open();
  await old.table("saves").put({ id: "main", data: fixture.expected });
  old.close();
  await db.open();
  vi.spyOn(db.cards, "bulkPut").mockRejectedValueOnce(
    Error("upgrade interrupted"),
  );
  await expect(load()).rejects.toThrow("upgrade interrupted");
  expect((await db.saves.get("main"))?.data).toEqual(fixture.expected);
  expect(await db.cards.count()).toBe(0);
  expect(await db.backups.count()).toBe(0);
  await load();
  expect(JSON.parse((await db.backups.get("migration-v2"))!.raw!)).toEqual(
    fixture.expected,
  );
});

it("upgrades backup metadata from database v2 without changing either JSON or gzip bytes", async () => {
  await db.delete();
  const old = new Dexie(db.name);
  old.version(2).stores({
    saves: "id",
    backups: "id,at,kind,compression",
    versions: "id,kind",
    objects: "id",
    preferences: "id",
    ...Object.fromEntries(
      collections.map((k) => [
        k,
        k === "entries"
          ? "id,position,endedAt,startedAt,cardId,date"
          : "id,position",
      ]),
    ),
  });
  await old.open();
  const bytes = new Uint8Array(
    await (await gzip(JSON.stringify(fixture.expected))).arrayBuffer(),
  );
  const rows = [
    { id: "plain", at: 1, reason: "原件", kind: "import", raw: "original" },
    {
      id: "gzip",
      at: 2,
      reason: "压缩",
      kind: "daily",
      compression: "done",
      compressed: bytes,
    },
  ];
  await old.table("backups").bulkPut(rows);
  old.close();
  await db.open();
  expect(await db.backups.toArray()).toEqual(
    [...rows].sort((a, b) => a.id.localeCompare(b.id)),
  );
  expect((await listBackups()).map((x) => x.id)).toEqual(["gzip", "plain"]);
  expect((await listBackups())[0]).not.toHaveProperty("compressed");
  const file = await backupFile("gzip");
  expect(await readImportFile(file.data as Blob, file.suffix)).toBe(
    JSON.stringify(fixture.expected),
  );
});

it("reads another connection’s committed revision before making its next mutation", async () => {
  await importSave(JSON.stringify(fixture.expected));
  await readState();
  const other = new Dexie(db.name);
  await other.open();
  await other.transaction("rw", other.table("saves"), async () => {
    const row = await other.table("saves").get("main");
    row.revision++;
    row.data.profile.name = "second connection";
    await other.table("saves").put(row);
  });
  other.close();
  expect((await readState()).profile.name).toBe("second connection");
  await mutate((s) => {
    s.profile.age = 40;
  });
  expect((await readState()).profile).toMatchObject({
    name: "second connection",
    age: 40,
  });
});

it("retains broken version references for recovery and allows an explicit good backup to replace them", async () => {
  await importSave(JSON.stringify(fixture.expected));
  const good = await backup();
  await db.versions.clear();
  db.close();
  await db.open();
  await expect(load()).rejects.toThrow(/缺少/);
  const damaged = JSON.parse(await recoveryBackup());
  expect(damaged.data.versions).toEqual([]);
  expect(damaged.data.rows.actions).toHaveLength(1);
  await importSave(good);
  expect(await readState()).toEqual(fixture.expected);
  const before = (await db.backups.toArray()).filter(
    (x) => x.reason === "导入前备份",
  );
  expect(
    before.some((x) => JSON.parse(x.raw!).data.versions.length === 0),
  ).toBe(true);
});

it("rejects duplicate change IDs in plain saves instead of collapsing historical rows", async () => {
  await load();
  const value = structuredClone(fixture.expected);
  value.changes.push({ ...value.changes[0], note: "duplicate" });
  await expect(importSave(JSON.stringify(value))).rejects.toThrow(/重复/);
  expect(await db.backups.count()).toBe(0);
});

it("keeps unmodeled old fields in the import original even though current schema does not expose them", async () => {
  const value = {
    ...fixture.expected,
    unmodeledFutureField: { preserve: "original" },
  };
  await importSave(JSON.stringify(value));
  expect(await readState()).toEqual(validateState(fixture.expected));
  expect(
    JSON.parse(
      (await db.backups.toArray()).find((x) => x.reason === "导入原文件")!.raw!,
    ),
  ).toEqual(value);
});
