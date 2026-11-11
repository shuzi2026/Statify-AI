import { storageRules } from "../shared/rules/storage";
import { download, gzip, maxImportBytes } from "./storage-files";
export {
  download,
  gzip,
  maxImportBytes,
  readImportFile,
} from "./storage-files";
import Dexie, { type EntityTable } from "dexie";
import { paymentRegion, paymentEnvironment } from "./payments/deployment";
import { dataScope } from "./platform/capabilities";
import { fresh, type State } from "./model";
import { validateState, parseImport } from "./migrate";
import { sameStoredValue } from "./storage-equality";
import {
  acceptDraftEpoch,
  currentDraftEpoch,
  draftEpochKey,
  newDraftEpoch,
} from "./local-data/draft-epoch";
import { prepareSaveReplacement, ReplacementCancelled } from "./application/save-replacement";
import { rollDays, dateKey } from "./engine";
import {
  assertSaveScope,
  clearSaveSnapshot,
  publishSave,
  saveSnapshot,
  SaveConflict,
  type SaveScope,
} from "./save-publication";
import {
  collections,
  packState,
  unpackState,
  encodeBackup,
  canonical,
  immutableLegacy,
  type PackedState,
  type StoredRow,
  type VersionRow,
} from "./storage-format";
export type BackupRow = {
  id: string;
  at: number;
  reason: string;
  raw?: string;
  compressed?: Uint8Array;
  kind?: string;
  compression?: string;
};
export const db = new Dexie(
  dataScope(
    paymentRegion,
    paymentEnvironment,
    import.meta.env.VITE_STATIFY_DATABASE_NAME,
  ).databaseName,
) as Dexie & {
  saves: EntityTable<
    { id: string; data: any; layout?: number; revision?: number },
    "id"
  >;
  backups: EntityTable<BackupRow, "id">;
  backupHeads: EntityTable<Omit<BackupRow, "raw" | "compressed">, "id">;
  versions: EntityTable<VersionRow, "id">;
  objects: EntityTable<{ id: string; data: any }, "id">;
  preferences: EntityTable<{ id: string; value: any }, "id">;
} & Record<(typeof collections)[number], EntityTable<StoredRow, "id">>;
db.version(1).stores({ saves: "id", backups: "id,at" });
db.version(2).stores({
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
db.version(3)
  .stores({ backupHeads: "id,at,kind" })
  .upgrade(async (tx) => {
    const heads: Omit<BackupRow, "raw" | "compressed">[] = [];
    await tx
      .table("backups")
      .each(({ raw, compressed, ...head }: BackupRow) => {
        heads.push(head);
      });
    if (heads.length) await tx.table("backupHeads").bulkPut(heads);
  });
async function keepBackup(row: BackupRow) {
  const { raw, compressed, ...head } = row;
  await db.backups.put(row);
  await db.backupHeads.put(head);
}
function assertLayout(row: { layout?: number } | undefined) {
  if (row && row.layout !== undefined && row.layout !== 1 && row.layout !== 2)
    throw Error("不支持此存储版本，请先导出原始存档并使用对应版本恢复");
}
function writableRevision(
  row: { layout?: number; revision?: number; data: any } | undefined,
) {
  assertLayout(row);
  const version = row?.data?.version;
  if (version !== undefined && version !== "0.2.1" && version !== "0.2.2")
    throw Error("不支持此版本存档，请先导出原始存档并使用对应版本恢复");
  const revision = row?.revision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw Error("存档修订号无效，请先导出原始存档");
  return revision;
}
/** Capture before confirmation or file I/O; zero means no main save exists. */
export async function readRevision() {
  return writableRevision(await db.saves.get("main"));
}
const tables = () => [
  db.saves,
  db.backups,
  db.backupHeads,
  db.versions,
  db.objects,
  ...collections.map((k) => db[k]),
];
const serializations = new WeakMap<StoredRow, string>();
const serialized = (row: StoredRow | undefined) => {
  if (!row) return "";
  let value = serializations.get(row);
  if (value === undefined) {
    value = JSON.stringify(row);
    serializations.set(row, value);
  }
  return value;
};
let cache:
  { revision: number; header: string; packed: PackedState } | undefined;
db.on("close", () => {
  cache = undefined;
  clearSaveSnapshot();
});
export let lastWriteStats = { upserts: 0, deletes: 0 };
function storageFailure(error: unknown): never {
  cache = undefined;
  const value = error as {
    name?: string;
    inner?: { name?: string };
    cause?: { name?: string };
  };
  if (
    [value?.name, value?.inner?.name, value?.cause?.name].includes(
      "QuotaExceededError",
    )
  )
    throw Error(
      "本地存储空间不足，本次更改未保存。请先导出备份，再释放设备空间后重试。",
      { cause: error },
    );
  throw error;
}
async function readPacked(row: {
  data: any;
  revision?: number;
}): Promise<PackedState> {
  const header = canonical(row.data);
  if (cache && cache.revision === row.revision && cache.header === header)
    return cache.packed;
  const values = await Promise.all(collections.map((k) => db[k].toArray()));
  const packed: PackedState = {
    schemaVersion: 2,
    header: row.data,
    rows: Object.fromEntries(
      collections.map((k, i) => [k, values[i]]),
    ) as PackedState["rows"],
    versions: await db.versions.toArray(),
    legacy: immutableLegacy((await db.objects.get("legacy"))?.data ?? null),
  };
  return packed;
}
async function writeState(
  state: State,
  previous: PackedState | undefined,
  revision: number,
) {
  const next = packState(state, previous?.versions),
    stats = { upserts: 0, deletes: 0 };
  if (!previous) {
    const occupied = await Promise.all(
      [...collections.map((k) => db[k]), db.versions, db.objects].map((table) =>
        table.count(),
      ),
    );
    if (occupied.some((count) => count > 0))
      throw Error(
        "检测到缺少存档入口的原始数据，请先导出原始存档恢复，未覆盖数据",
      );
  }
  for (const key of collections) {
    const old = new Map((previous?.rows[key] || []).map((r) => [r.id, r]));
    const changed: StoredRow[] = [];
    for (let i = 0; i < next.rows[key].length; i++) {
      const r = next.rows[key][i],
        prior = old.get(r.id);
      if (!sameStoredValue(prior, r) && serialized(prior) !== serialized(r)) {
        const copy = structuredClone(r);
        changed.push(copy);
        next.rows[key][i] = copy;
      } else next.rows[key][i] = prior!;
      old.delete(r.id);
    }
    if (changed.length) await db[key].bulkPut(changed);
    if (old.size) await db[key].bulkDelete([...old.keys()]);
    stats.upserts += changed.length;
    stats.deletes += old.size;
  }
  const oldVersions = new Set(previous?.versions.map((v) => v.id) || []);
  next.versions = next.versions.map((v) =>
    oldVersions.has(v.id) ? v : structuredClone(v),
  );
  const newVersions = next.versions.filter((v) => !oldVersions.has(v.id));
  if (newVersions.length) await db.versions.bulkPut(newVersions);
  const used = new Set(next.versions.map((v) => v.id)),
    unused = [...oldVersions].filter((id) => !used.has(id));
  if (unused.length) await db.versions.bulkDelete(unused);
  if (
    !previous ||
    (previous.legacy !== next.legacy &&
      canonical(previous.legacy) !== canonical(next.legacy))
  )
    await db.objects.put({ id: "legacy", data: next.legacy });
  next.header = structuredClone(next.header);
  await db.saves.put({ id: "main", layout: 2, revision, data: next.header });
  // Publish only after the enclosing transaction commits; callers invalidate on failure.
  return { next, stats };
}
async function dailyBackup(previous: PackedState) {
  if (!(previous.header.profile as State["profile"]).onboarded) return;
  const id = "daily:" + dateKey(Date.now());
  if (await db.backupHeads.get(id)) return;
  await keepBackup({
    id,
    at: Date.now(),
    reason: "每日自动备份",
    kind: "daily",
    compression: "pending",
    // Expand the pre-change save only when this transaction needs a new backup.
    raw: encodeBackup(unpackState(previous)),
  });
  const rows = await db.backupHeads.where("kind").equals("daily").sortBy("at");
  if (rows.length > storageRules.dailyBackupCount) {
    const ids = rows.slice(0, -storageRules.dailyBackupCount).map((r) => r.id);
    await db.backups.bulkDelete(ids);
    await db.backupHeads.bulkDelete(ids);
  }
}
const committedEntries = new WeakMap<StoredRow, State["entries"][number]>();
function committed(state: State, packed?: PackedState) {
  // writeState already retains identical StoredRows. Reuse their immutable view
  // objects so publishing an unrelated edit does not replace the entire history.
  const rows = packed && new Map(packed.rows.entries.map(row => [row.id, row]));
  const previous = saveSnapshot()?.state.entries;
  let unchanged = !!previous && previous.length === state.entries.length;
  for (let i = 0; i < state.entries.length; i++) {
    const row = rows?.get(state.entries[i].id);
    const cached = row && committedEntries.get(row);
    const entry = cached || immutableLegacy(state.entries[i]);
    state.entries[i] = entry;
    if (row && !cached) committedEntries.set(row, entry);
    if (entry !== previous?.[i]) unchanged = false;
  }
  if (unchanged) state.entries = previous!;
  else Object.freeze(state.entries);
  return state;
}
function remember(
  revision: number,
  packed: PackedState,
  stats = lastWriteStats,
) {
  cache = { revision, header: canonical(packed.header), packed };
  lastWriteStats = stats;
}
/** An active calendar update must still belong to the save that scheduled it. */
export async function load(scope?: SaveScope): Promise<State> {
  cache = undefined;
  try {
    const value = await db.transaction("rw", [...tables(), db.preferences], async () => {
      const draftEpoch = (await db.preferences.get(draftEpochKey))?.value;
      const row = await db.saves.get("main");
      assertLayout(row);
      if (scope) {
        assertSaveScope(scope);
        if (writableRevision(row) !== scope.revision)
          throw new SaveConflict(scope);
      }
      let previous: PackedState | undefined, state: State;
      if (row?.layout === 2) {
        previous = await readPacked(row);
        state = validateState(unpackState(previous));
      } else if (row) {
        state = validateState(row.data);
        await keepBackup({
          id: "migration-v2",
          at: Date.now(),
          reason: "存储升级前原始存档",
          kind: "migration",
          raw: JSON.stringify(row.data),
        });
      } else {
        const raw = localStorage.getItem("life-rpg-v3");
        state = raw
          ? parseImport(JSON.parse(raw))
          : fresh(Date.now(), paymentRegion);
        if (raw)
          await keepBackup({
            id: "legacy-v3",
            at: Date.now(),
            reason: "首次迁移前0.1原始存档",
            kind: "migration",
            raw,
          });
      }
      // Capture every editable field before rollDays. The legacy original was
      // frozen by readPacked and is never edited by rollover; retain its identity.
      const before = previous
        ? { ...structuredClone({ ...state, legacy: null }), legacy: state.legacy }
        : null;
      rollDays(state, Date.now());
      if (
        !previous ||
        (!sameStoredValue(state, before) && canonical(state) !== canonical(before))
      ) {
        if (previous) await dailyBackup(previous);
        const revision = (row?.revision || 0) + 1,
          result = await writeState(state, previous, revision);
        return { state, revision, draftEpoch, changed: true, ...result };
      }
      return {
        state,
        draftEpoch,
        changed: false,
        revision: row!.revision!,
        next: previous,
        stats: { upserts: 0, deletes: 0 },
      };
    });
    remember(value.revision, value.next, value.stats);
    void compressDailyBackups();
    const state = committed(value.state, value.next);
    if (!saveSnapshot() || value.revision > saveSnapshot()!.revision) acceptDraftEpoch(value.draftEpoch);
    publishSave(
      state,
      value.revision,
      db.name,
      scope ? "mutation" : "load",
      value.changed,
    );
    return state;
  } catch (e) {
    storageFailure(e);
  }
}
async function readSnapshot() {
  return db.transaction(
    "r",
    [db.saves, db.versions, db.objects, db.preferences, ...collections.map((k) => db[k])],
    async () => {
      const row = await db.saves.get("main");
      assertLayout(row);
      if (!row) throw Error("找不到存档");
      return { draftEpoch: (await db.preferences.get(draftEpochKey))?.value ?? null, revision: row.revision || 0, state: committed(
        validateState(
          row.layout === 2 ? unpackState(await readPacked(row)) : row.data,
        ),
      ) };
    },
  );
}
export async function readState(): Promise<State> {
  return (await readSnapshot()).state;
}
export async function refreshState() {
  const value = await readSnapshot();
  if (value.revision > (saveSnapshot()?.revision ?? -1)) {
    if (value.draftEpoch !== currentDraftEpoch()) {
      try { await prepareSaveReplacement({ source: "refresh", revision: value.revision }); }
      catch (error) { if (error instanceof ReplacementCancelled) return saveSnapshot()?.state ?? value.state; throw error; }
      // A confirmation may take time; re-read rather than publish an outdated copy.
      const latest = await readSnapshot();
      if (latest.revision !== value.revision) return refreshState();
    }
    if (value.revision <= (saveSnapshot()?.revision ?? -1)) return saveSnapshot()!.state;
    acceptDraftEpoch(value.draftEpoch);
  }
  publishSave(value.state, value.revision, db.name, "refresh", false);
  return value.state;
}
/** Check before any enclosing policy inspects the draft or asks for a decision. */
export function synchronousResult<T>(result: T): T & (T extends PromiseLike<unknown> ? never : unknown) {
  if (result && typeof (result as unknown as PromiseLike<unknown>).then === "function") {
    void Promise.resolve(result).catch(() => {});
    throw Error("存档变更回调必须同步完成，不能等待网络或界面操作");
  }
  return result as T & (T extends PromiseLike<unknown> ? never : unknown);
}
export async function mutate<T>(
  fn: (s: State) => T & (T extends PromiseLike<unknown> ? never : unknown),
  options: { expectedRevision?: number; guard?: () => void } = {},
): Promise<{ state: State; result: T }> {
  try {
    const value = await db.transaction("rw", tables(), async () => {
      const row = await db.saves.get("main");
      assertLayout(row);
      if (!row || row.layout !== 2) throw Error("存档尚未加载");
      options.guard?.();
      if (options.expectedRevision !== undefined && row.revision !== options.expectedRevision)
        throw new SaveConflict();
      const previous = await readPacked(row),
        state = validateState(unpackState(previous));
      rollDays(state, Date.now());
      const result = synchronousResult(fn(state));
      const checked = validateState(state);
      await dailyBackup(previous);
      const revision = (row.revision || 0) + 1,
        written = await writeState(checked, previous, revision);
      return { state: checked, result, revision, ...written };
    });
    remember(value.revision, value.next, value.stats);
    void compressDailyBackups();
    const state = committed(value.state, value.next);
    publishSave(state, value.revision, db.name, "mutation");
    return { state, result: value.result };
  } catch (e) {
    storageFailure(e);
  }
}
export async function importSave(
  text: string,
  options: {
    expectedRevision?: number;
    source?: "cloud";
    guard?: () => void;
    cloudOwner?: string;
    cloudFromOtherDevice?: boolean;
  } = {},
) {
  if (text.length > maxImportBytes || new Blob([text]).size > maxImportBytes)
    throw Error("存档不能超过64MB");
  const next = parseImport(JSON.parse(text));
  try {
    const expectedRevision = options.expectedRevision ?? (await readRevision());
    const value = await db.transaction(
      "rw",
      [...tables(), db.preferences],
      async () => {
        options.guard?.();
        const old = await db.saves.get("main");
        if (writableRevision(old) !== expectedRevision)
          throw Error(
            options.source === "cloud"
              ? "Your device save changed during sync. No save was replaced."
              : "当前存档已在等待期间发生变化，未替换任何数据。请重新选择文件并确认。",
          );
        const previous = old?.layout === 2 ? await readPacked(old) : undefined;
        if (old)
          await keepBackup({
            id: crypto.randomUUID(),
            at: Date.now(),
            reason: "导入前备份",
            kind: "import",
            raw: previous
              ? JSON.stringify({
                  format: "statify-backup",
                  formatVersion: 2,
                  data: previous,
                })
              : JSON.stringify(old.data),
          });
        await keepBackup({
          id: crypto.randomUUID(),
          at: Date.now(),
          reason: "导入原文件",
          kind: "import",
          raw: text,
        });
        const revision = (old?.revision || 0) + 1,
          written = await writeState(next, previous, revision);
        if (options.cloudOwner)
          await db.preferences.put({
            id: "global-sync-owner",
            value: options.cloudOwner,
          });
        options.guard?.();
        const draftEpoch = newDraftEpoch(
          options.source === "cloud" && options.cloudFromOtherDevice === true,
        );
        await db.preferences.put({ id: draftEpochKey, value: draftEpoch });
        options.guard?.();
        return { revision, draftEpoch, ...written };
      },
    );
    remember(value.revision, value.next, value.stats);
    const state = committed(next, value.next);
    if (value.revision > (saveSnapshot()?.revision ?? -1)) acceptDraftEpoch(value.draftEpoch);
    publishSave(state, value.revision, db.name, options.source === "cloud" ? "cloud" : "import");
    return state;
  } catch (e) {
    storageFailure(e);
  }
}
export async function resetForTesting(options: { expectedRevision?: number; guard?: () => void } = {}) {
  const next = fresh(Date.now(), paymentRegion);
  try {
    const value = await db.transaction("rw", [...tables(), db.preferences], async () => {
      const old = await db.saves.get("main");
      const revisionBefore = writableRevision(old);
      options.guard?.();
      if (options.expectedRevision !== undefined && revisionBefore !== options.expectedRevision)
        throw new SaveConflict();
      const previous = old?.layout === 2 ? await readPacked(old) : undefined;
      if (old)
        next.createdAt = Math.max(next.createdAt, old.data.createdAt + 1);
      const revision = (old?.revision || 0) + 1,
        written = await writeState(next, previous, revision);
      const draftEpoch = newDraftEpoch();
      await db.preferences.put({ id: draftEpochKey, value: draftEpoch });
      return { revision, draftEpoch, ...written };
    });
    remember(value.revision, value.next, value.stats);
    const state = committed(next, value.next);
    if (value.revision > (saveSnapshot()?.revision ?? -1)) acceptDraftEpoch(value.draftEpoch);
    publishSave(state, value.revision, db.name, "reset");
    return state;
  } catch (e) {
    storageFailure(e);
  }
}
export async function readCloudSnapshot(expectedRevision?: number) {
  return db.transaction(
    "r",
    [db.saves, db.versions, db.objects, ...collections.map((k) => db[k])],
    async () => {
      const row = await db.saves.get("main");
      assertLayout(row);
      if (!row) throw Error("No device save found.");
      if (expectedRevision !== undefined && row.revision !== expectedRevision)
        throw Error(
          "Your device save changed during sync. Review the copies again.",
        );
      const packed =
        row.layout === 2
          ? await readPacked(row)
          : packState(validateState(row.data));
      return {
        text: JSON.stringify({
          format: "statify-backup",
          formatVersion: 2,
          data: packed,
        }),
        revision: row.revision || 0,
      };
    },
  );
}
export async function backup() {
  return encodeBackup(await readState());
}
export async function recoveryBackup() {
  return db.transaction(
    "r",
    [db.saves, db.versions, db.objects, ...collections.map((k) => db[k])],
    async () => {
      const row = await db.saves.get("main");
      if (row) {
        if (row.layout !== undefined && row.layout !== 1 && row.layout !== 2) {
          const values = await Promise.all(
            collections.map((k) => db[k].toArray()),
          );
          return JSON.stringify({
            format: "statify-recovery",
            formatVersion: 2,
            main: row,
            rows: Object.fromEntries(collections.map((k, i) => [k, values[i]])),
            versions: await db.versions.toArray(),
            objects: await db.objects.toArray(),
          });
        }
        if (row.layout !== 2) return JSON.stringify(row.data, null, 2);
        const values = await Promise.all(
          collections.map((k) => db[k].toArray()),
        );
        return JSON.stringify({
          format: "statify-backup",
          formatVersion: 2,
          data: {
            schemaVersion: 2,
            header: row.data,
            rows: Object.fromEntries(collections.map((k, i) => [k, values[i]])),
            versions: await db.versions.toArray(),
            legacy: immutableLegacy(
              (await db.objects.get("legacy"))?.data ?? null,
            ),
          },
        });
      }
      const values = await Promise.all(collections.map((k) => db[k].toArray())),
        versions = await db.versions.toArray(),
        legacyObject = await db.objects.get("legacy");
      if (values.some((rows) => rows.length) || versions.length || legacyObject)
        return JSON.stringify({
          format: "statify-recovery",
          formatVersion: 2,
          header: null,
          rows: Object.fromEntries(collections.map((k, i) => [k, values[i]])),
          versions,
          legacy: legacyObject?.data,
        });
      const legacy = localStorage.getItem("life-rpg-v3");
      if (legacy) return legacy;
      throw Error("没有可导出的原始存档");
    },
  );
}
let compressing = false;
async function compressDailyBackups() {
  if (compressing || typeof CompressionStream === "undefined") return;
  compressing = true;
  try {
    const rows = await db.backups
      .where("compression")
      .equals("pending")
      .toArray();
    for (const row of rows) {
      if (!row.raw) continue;
      const bytes = new Uint8Array(await (await gzip(row.raw)).arrayBuffer());
      await db.transaction("rw", db.backups, async () => {
        const current = await db.backups.get(row.id);
        if (current && current.raw === row.raw)
          await db.backups.put(
            bytes.length < new Blob([row.raw!]).size
              ? {
                  ...current,
                  raw: undefined,
                  compressed: bytes,
                  compression: "done",
                }
              : { ...current, compression: "done" },
          );
      });
    }
  } catch {
    /* A failed compression leaves the complete original backup intact. */
  } finally {
    compressing = false;
  }
}
export async function listBackups() {
  return db.backupHeads.orderBy("at").reverse().toArray();
}
export async function backupFile(id: string) {
  const row = await db.backups.get(id);
  if (!row) throw Error("备份已不存在");
  return row.compressed
    ? {
        data: new Blob([row.compressed as BlobPart], {
          type: "application/gzip",
        }),
        suffix: ".json.gz",
      }
    : { data: row.raw!, suffix: ".json" };
}
export async function storageStatus() {
  const storage = globalThis.navigator?.storage,
    estimate = await storage?.estimate?.().catch(() => undefined),
    persistent = await storage?.persisted?.().catch(() => false);
  // Older lastExport values only prove a handoff was requested, not a saved file.
  const exported = (await db.preferences.get("lastConfirmedExport"))?.value as
    number | undefined;
  return {
    usage: estimate?.usage,
    quota: estimate?.quota,
    persistent: !!persistent,
    canPersist: !!storage?.persist,
    exportDue:
      !exported || Date.now() - exported > storageRules.exportReminderMs,
  };
}
export async function requestPersistence() {
  return (await globalThis.navigator?.storage?.persist?.()) ?? false;
}
export async function exportBackup(compressed = false) {
  const raw = await backup();
  return download(
    compressed ? await gzip(raw) : JSON.stringify(JSON.parse(raw), null, 2),
    "Statify-0.2.2-" +
      dateKey(Date.now()) +
      (compressed ? ".json.gz" : ".json"),
  );
}
/** Called only after the user confirms finding the independent exported file. */
export async function confirmBackupExport(exportedAt: number) {
  if (
    !Number.isFinite(exportedAt) ||
    exportedAt <= 0 ||
    exportedAt > Date.now()
  )
    throw Error("备份确认时间无效，请重新导出");
  await db.transaction("rw", db.preferences, async () => {
    const previous = (await db.preferences.get("lastConfirmedExport"))?.value;
    await db.preferences.put({
      id: "lastConfirmedExport",
      value: Math.max(typeof previous === "number" ? previous : 0, exportedAt),
    });
  });
}
