import { type Entry } from "./model";
import { completionDate } from "./storage-format";
type Index = {
  byPlan: Map<string, Entry[]>;
  byCard: Map<string, Entry[]>;
  byDay: Map<string, Entry[]>;
};
const cached = new WeakMap<Entry[], Index>();
export function entryIndex(entries: Entry[]): Index {
  const prior = cached.get(entries);
  if (prior) return prior;
  const index: Index = {
    byPlan: new Map(),
    byCard: new Map(),
    byDay: new Map(),
  };
  const add = (map: Map<string, Entry[]>, key: string, e: Entry) => {
    const rows = map.get(key);
    if (rows) rows.push(e);
    else map.set(key, [e]);
  };
  for (const e of entries) {
    add(index.byCard, e.cardId, e);
    add(index.byDay, completionDate(e.endedAt), e);
    if (e.counted) for (const id of new Set(e.plans)) add(index.byPlan, id, e);
  }
  for (const rows of index.byPlan.values())
    rows.sort((a, b) => a.startedAt - b.startedAt);
  // Only cache committed immutable arrays. Engine drafts and fixtures remain mutable.
  if (Object.isFrozen(entries)) cached.set(entries, index);
  return index;
}
export function planEntries(
  entries: Entry[],
  id: string,
  start: number,
  end: number,
  completedBy = Infinity,
) {
  const rows = entryIndex(entries).byPlan.get(id) || [];
  let low = 0,
    high = rows.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (rows[middle].startedAt < start) low = middle + 1;
    else high = middle;
  }
  const result: Entry[] = [];
  for (let i = low; i < rows.length && rows[i].startedAt < end; i++)
    if (rows[i].endedAt <= completedBy) result.push(rows[i]);
  return result;
}
