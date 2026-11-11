import { expect, it } from "vitest";
import type { Entry } from "../model";
import { entryIndex } from "../entry-index";
import { journalRows, journalSentence } from "./read-model";

function entry(id: string, endedAt: string, note = ""): Entry {
  return {
    id,
    cardId: "deleted-card",
    name: "Read 中文",
    method: "timed",
    startedAt: new Date("2026-10-13T23:50:00").getTime(),
    endedAt: new Date(endedAt).getTime(),
    date: "2026-10-13",
    seconds: 1800,
    measured: 1800,
    quantity: 1,
    counted: true,
    rating: 1,
    coefficient: 1,
    note,
    score: 1,
    plans: [],
    rewards: [],
    effects: [],
    values: [],
    legacy: false,
  };
}

it("reads the local completion day, preserves equal-time order and never mutates shared indices", () => {
  const entries = [
    entry("overnight", "2026-10-14T00:20:00"),
    entry("yesterday", "2026-10-13T22:00:00"),
    entry("newer", "2026-10-14T09:00:00"),
    entry("tie", "2026-10-14T09:00:00"),
  ];
  entries.forEach(Object.freeze);
  Object.freeze(entries);
  const before = JSON.stringify(entries),
    index = entryIndex(entries);
  const view = journalRows(entries, "Player", "2026-10-14", "");
  expect(view.rows.map((e) => e.id)).toEqual(["newer", "tie", "overnight"]);
  expect([...view.groups.keys()]).toEqual(["2026-10-14"]);
  expect(index.byDay.get("2026-10-14")!.map((e) => e.id)).toEqual([
    "overnight",
    "newer",
    "tie",
  ]);
  expect(view.rows[0]).toBe(entries[2]);
  expect(JSON.stringify(entries)).toBe(before);
});

it("searches all dates using the current name, historical card name and untrimmed note", () => {
  const entries = [
    entry("today", "2026-10-14T09:00:00", " Note 中文 "),
    entry("other", "2026-10-13T22:00:00", "only yesterday"),
  ];
  for (const term of ["Player", "Read 中文"])
    expect(
      journalRows(entries, "Player", "2026-10-14", term).rows.map((e) => e.id),
    ).toEqual(["today", "other"]);
  expect(journalRows(entries, "Player", "2026-10-14", " Note 中文 ").rows).toEqual([entries[0]]);
  expect(journalRows(entries, "Player", "2026-10-14", "only yesterday").rows).toEqual([entries[1]]);
  for (const term of ["player", "missing"])
    expect(journalRows(entries, "Player", "2026-10-14", term).rows).toEqual([]);
  expect(journalRows(entries, "Renamed", "2026-10-14", "Player").rows).toEqual(
    [],
  );
  expect(
    journalRows(entries, "Renamed", "2026-10-14", "Renamed").rows,
  ).toHaveLength(2);
});

it("a committed replacement or a mutable draft cannot reuse stale search results", () => {
  const rows = [entry("one", "2026-10-14T09:00:00", "original")];
  expect(journalRows(rows, "A", "2026-10-14", "original").rows).toHaveLength(1);
  rows[0] = { ...rows[0], note: "edited" };
  expect(journalRows(rows, "A", "2026-10-14", "original").rows).toEqual([]);
  Object.freeze(rows);
  const replaced = [{ ...rows[0], note: "replacement" }];
  Object.freeze(replaced);
  expect(
    journalRows(replaced, "A", "2026-10-14", "replacement").rows,
  ).toHaveLength(1);
  expect(journalRows([], "A", "2026-10-14", "replacement").groups.size).toBe(0);
});

it("keeps partial and legacy history readable after the source card disappears", () => {
  const partial = {
    ...entry("partial", "2026-10-14T00:20:00"),
    counted: false,
    legacy: true,
  };
  expect(journalRows([partial], "中文 Player", "2026-10-14", "").rows).toEqual([
    partial,
  ]);
  expect(journalSentence("中文 Player", partial)).toBe(
    "中文 Player进行了「Read 中文」（部分记录）。",
  );
  expect(journalSentence("中文 Player", { ...partial, counted: true })).toBe(
    "中文 Player完成了「Read 中文」。",
  );
});

it("searches 50,000 synthetic records across dates and limits rendered groups", () => {
  const entries = Array.from({ length: 50000 }, (_, i) => {
    const end = new Date(
      2026,
      9,
      14 - (i % 100),
      0,
      0,
      Math.floor(i / 100),
    ).getTime();
    return {
      ...entry(String(i), "2026-10-14T00:00:00"),
      endedAt: end,
      note: i === 49901 ? "needle" : "",
    };
  });
  Object.freeze(entries);
  const view = journalRows(entries, "Synthetic", "2026-10-14", "");
  expect(view.rows).toHaveLength(500);
  expect(view.rows[0].id).toBe("49900");
  expect(view.rows.at(-1)!.id).toBe("0");
  expect(
    journalRows(entries, "Synthetic", "2026-10-14", "needle").rows.map(
      (e) => e.id,
    ),
  ).toEqual(["49901"]);
  const firstPage = journalRows(entries, "Synthetic", "2026-10-14", "Synthetic", 50);
  const nextPage = journalRows(entries, "Synthetic", "2026-10-14", "Synthetic", 550);
  expect(firstPage.rows).toHaveLength(50);
  expect(firstPage.hasMore).toBe(true);
  expect(nextPage.rows.slice(0, 50)).toEqual(firstPage.rows);
  expect(new Set(nextPage.rows.map((row) => row.id)).size).toBe(550);
  expect([...nextPage.groups.keys()]).toEqual(["2026-10-14", "2026-10-13"]);
  expect(entries[49901].note).toBe("needle");
  expect(entries).toHaveLength(50000);
});
