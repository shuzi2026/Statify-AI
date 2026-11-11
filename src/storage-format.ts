import { localDateKey } from "../shared/calendar.ts";
import { saveCollectionLimits } from "../shared/rules/storage.ts";
import type { State } from "../shared/save-schema";

export const collections = [
  "cards",
  "cardTemplates",
  "attributes",
  "meters",
  "actions",
  "entries",
  "plans",
  "days",
  "planCycles",
  "messages",
  "changes",
] as const;
export type Collection = (typeof collections)[number];
export type StoredRow = {
  id: string;
  position: number;
  data: any;
  endedAt?: number;
  startedAt?: number;
  cardId?: string;
  date?: string;
};
export type VersionRow = { id: string; kind: "card" | "plan"; data: any };
export type PackedState = {
  schemaVersion: 2;
  header: Record<string, unknown>;
  rows: Record<Collection, StoredRow[]>;
  versions: VersionRow[];
  legacy: unknown;
};
// Comparing canonical contents avoids both hash collisions and accidental duplication.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "null";
}
// The legacy payload is a preserved original, never an editable live entity.
const immutableObjects = new WeakSet<object>();
export function immutableLegacy<T>(value: T): T {
  const pending: unknown[] = [value];
  while (pending.length) {
    const item = pending.pop();
    if (item && typeof item === "object" && !immutableObjects.has(item)) {
      immutableObjects.add(item);
      for (const child of Object.values(item)) pending.push(child);
      Object.freeze(item);
    }
  }
  return value;
}
export function packState(
  state: State,
  existing: VersionRow[] = [],
): PackedState {
  const header = { ...state } as Record<string, unknown>,
    versions: VersionRow[] = [],
    lookup = new Map(existing.map((v) => [v.kind + canonical(v.data), v])),
    used = new Set<string>();
  const reference = (kind: VersionRow["kind"], data: unknown) => {
    const key = kind + canonical(data);
    let row = lookup.get(key);
    if (!row) {
      row = { id: crypto.randomUUID(), kind, data };
      lookup.set(key, row);
    }
    if (!used.has(row.id)) {
      versions.push(row);
      used.add(row.id);
    }
    return row.id;
  };
  const cardRef = (card: any) => {
    const {
      count,
      favorite,
      order,
      state,
      statsSince,
      changes,
      ...definition
    } = card;
    return {
      cardVersionId: reference("card", definition),
      cardRuntime: { count, favorite, order, state, statsSince, changes },
    };
  };
  const rows = {} as PackedState["rows"];
  for (const name of collections) {
    delete header[name];
    rows[name] = (state[name] as any[]).map((value, position) => {
      let data = { ...value };
      if (name === "cards" || name === "cardTemplates")
        data = { id: value.id, ...cardRef(value) };
      if (name === "actions") {
        const { card, ...rest } = data;
        data = { ...rest, ...cardRef(card) };
      }
      if (name === "planCycles") {
        const { cards, slots, mode, target, timeline, ...rest } = data;
        data = {
          ...rest,
          planVersionId: reference("plan", {
            cards,
            slots,
            mode,
            target,
            timeline,
          }),
        };
      }
      return {
        id: name === "days" ? value.date : value.id,
        position,
        data,
        ...(name === "entries"
          ? {
              endedAt: value.endedAt,
              startedAt: value.startedAt,
              cardId: value.cardId,
              date: completionDate(value.endedAt),
            }
          : {}),
      };
    });
  }
  delete header.legacy;
  return {
    schemaVersion: 2,
    header,
    rows,
    versions,
    legacy: immutableLegacy(state.legacy),
  };
}
export function completionDate(at: number) {
  return localDateKey(at);
}
export function unpackState(p: PackedState): State {
  if (
    p.schemaVersion !== 2 ||
    !p.header ||
    !p.rows ||
    !Array.isArray(p.versions)
  )
    throw Error("不支持此存档格式");
  // Check every collection before touching versions or expanding any row.
  for (const name of collections) {
    if (!Array.isArray(p.rows[name])) throw Error("存档缺少 " + name);
    if (p.rows[name].length > saveCollectionLimits[name])
      throw Error("存档集合超过数量上限：" + name);
  }
  const versions = new Map(p.versions.map((v) => [v.id, v]));
  if (versions.size !== p.versions.length) throw Error("存档版本编码重复");
  const state = { ...p.header, legacy: p.legacy } as any;
  for (const name of collections) {
    const ids = new Set<string>();
    const positions = new Set<number>();
    for (const row of p.rows[name]) {
      if (
        !row ||
        !Number.isSafeInteger(row.position) ||
        row.position < 0 ||
        positions.has(row.position)
      )
        throw Error("存档排序位置无效或重复");
      positions.add(row.position);
    }
    state[name] = [...p.rows[name]]
      .sort((a, b) => a.position - b.position)
      .map((row) => {
        if (ids.has(row.id)) throw Error("存档编码重复");
        ids.add(row.id);
        let data = { ...row.data };
        if ((name === "days" ? data.date : data.id) !== row.id)
          throw Error("存档编码不一致");
        if (
          (name === "cards" || name === "cardTemplates") &&
          !data.cardVersionId
        )
          return data;
        if (
          name === "cards" ||
          name === "cardTemplates" ||
          name === "actions"
        ) {
          const v = versions.get(data.cardVersionId);
          if (!v || v.kind !== "card") throw Error("缺少任务卡牌版本");
          const { cardVersionId, cardRuntime, ...rest } = data;
          const card = {
            ...structuredClone(v.data),
            ...structuredClone(cardRuntime),
          };
          if (name !== "actions" && card.id !== row.id)
            throw Error("卡牌编码不一致");
          data = name === "actions" ? { ...rest, card } : card;
        }
        if (name === "planCycles") {
          const v = versions.get(data.planVersionId);
          if (!v || v.kind !== "plan") throw Error("缺少计划版本");
          const { planVersionId, ...rest } = data;
          data = { ...rest, ...structuredClone(v.data) };
        }
        return data;
      });
  }
  return state;
}
export const backupFormat = "statify-backup";
export function encodeBackup(state: State) {
  const data = packState(state);
  for (const key of collections)
    data.rows[key] = data.rows[key].map(({ id, position, data }) => ({
      id,
      position,
      data,
    }));
  return JSON.stringify({
    format: backupFormat,
    formatVersion: 2,
    exportedAt: Date.now(),
    data,
  });
}
export function decodeBackup(raw: any): unknown {
  if (raw?.format !== undefined && raw.format !== backupFormat)
    throw Error("不支持此存档格式，请使用对应版本恢复");
  if (raw?.format !== backupFormat) return raw;
  if (raw.formatVersion !== 2) throw Error("不支持此备份版本，请更新应用");
  return unpackState(raw.data);
}
