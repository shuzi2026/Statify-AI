import type { Entry } from "../model";
import { entryIndex } from "../entry-index";
import { dateKey } from "../engine";
import { shoppingPrice } from "../../shared/shopping-demo";

/** Search the committed history without changing its order or the shared day index. */
export function journalRows(
  entries: Entry[],
  profileName: string,
  date: string,
  search: string,
  limit = Infinity,
) {
  const byDay = entryIndex(entries).byDay;
  const matches = search
    ? entries.filter(
        (e) =>
          profileName.includes(search) ||
          e.name.includes(search) ||
          e.note.includes(search),
      )
    : [...(byDay.get(date) || [])];
  matches.sort((a, b) => b.endedAt - a.endedAt);
  const rows = matches.slice(0, limit);
  const groups = new Map<string, Entry[]>();
  for (const e of rows) {
    const day = dateKey(e.endedAt),
      group = groups.get(day);
    if (group) group.push(e);
    else groups.set(day, [e]);
  }

  return {
    rows,
    groups,
    hasMore: matches.length > rows.length,
    hasRecordedDate: (value: string) => byDay.has(value),
  };
}

export const journalSentence = (profileName: string, e: Entry) =>
  profileName +
  (e.purchase ? "购买了" : e.counted ? "完成了" : "进行了") +
  "「" +
  (e.purchase?.title || e.name) +
  "」" +
  (e.purchase ? "，花费 " + shoppingPrice(e.purchase.cents) + "。" : e.counted ? "。" : "（部分记录）。");
