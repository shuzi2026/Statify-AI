import { expect, it } from "vitest";
import { fresh, newCard, type Card, type Plan } from "./model";
import {
  collectionOptions,
  selectCards,
  toggleCommon,
  reorderCommon,
  insertBefore,
} from "./card-collection";
import { ensurePlanCycles } from "./planning";
const now = new Date(2026, 9, 24, 12).getTime();
const card = (id: string, patch: Partial<Card> = {}): Card => ({
  ...newCard(now),
  id,
  name: id,
  createdAt: 1,
  order: 0,
  ...patch,
});
const plan = (id: string, period: Plan["period"], cardId: string): Plan => ({
  id,
  name: id,
  period,
  mode: "cards",
  target: 1,
  cards: [{ id: cardId, target: 1 }],
  active: true,
  createdAt: now,
});
it("uses completion availability, normal time, day/week/month, counts and creation as separate recommendation criteria", () => {
  const s = fresh(now, "cn");
  s.cards = [
    card("blocked", { life: "consumable", uses: 1, count: 1 }),
    card("outside", {
      timeWindows: [{ start: "08:00", end: "09:00" }],
      timeMode: "hint",
    }),
    card("plain"),
    card("month"),
    card("week"),
    card("day"),
    card("frequent", { count: 8 }),
    card("newer", { createdAt: 3 }),
    card("new", { createdAt: 2 }),
  ];
  s.plans = [
    plan("d", "day", "day"),
    plan("w", "week", "week"),
    plan("m", "month", "month"),
  ];
  expect(selectCards(s, "all", now).map((c) => c.id)).toEqual([
    "day",
    "week",
    "month",
    "frequent",
    "newer",
    "new",
    "plain",
    "outside",
    "blocked",
  ]);
});
it("plan filters use explicit current membership, not every card in a score plan; completed plans lose ranking only", () => {
  const s = fresh(now, "cn");
  s.cards = [card("included"), card("other", { createdAt: 2 })];
  const p = {
    ...plan("p", "day", "included"),
    scope: "repeat" as const,
    anchor: "2026-10-24",
    startsAt: now - 1000,
    draft: false,
    mode: "score" as const,
    cards: [{ id: "included", target: 1, score: 1 }],
  };
  s.plans = [p];
  ensurePlanCycles(s, now);
  expect(selectCards(s, "day", now).map((c) => c.id)).toEqual(["included"]);
  expect(selectCards(s, "planned", now).map((c) => c.id)).toEqual(["included"]);
  s.entries.push({
    id: "done",
    cardId: "included",
    plans: ["p"],
    endedAt: now,
    startedAt: now - 500,
    counted: true,
  } as any);
  expect(selectCards(s, "all", now).map((c) => c.id)).toEqual([
    "other",
    "included",
  ]);
  expect(selectCards(s, "day", now).map((c) => c.id)).toEqual(["included"]);
  p.startsAt = now + 86400000;
  s.planCycles = [];
  expect(selectCards(s, "planned", now)).toEqual([]);
});
it("favorites use user order and are never promoted inside all cards; toggling adds at the end", () => {
  const s = fresh(now, "cn");
  s.cards = [
    card("a", { favorite: true, order: 5 }),
    card("b", { favorite: true, order: 2 }),
    card("c", { count: 4 }),
  ];
  expect(selectCards(s, "favorites", now).map((c) => c.id)).toEqual(["b", "a"]);
  expect(selectCards(s, "all", now)[0].id).toBe("c");
  toggleCommon(s, "c");
  expect(selectCards(s, "favorites", now).map((c) => c.id)).toEqual([
    "b",
    "a",
    "c",
  ]);
  toggleCommon(s, "a");
  expect(s.cards.find((c) => c.id === "a")?.favorite).toBe(false);
  expect(newCard(now).favorite).toBe(false);
});
it("drag insertion preserves every card, shifts followers and changes only common order", () => {
  const s = fresh(now, "cn");
  s.cards = ["a", "b", "c", "d"].map((id) =>
    card(id, { favorite: true, order: 2 }),
  );
  s.cards.push(
    card("archived", { state: "archived", favorite: true, order: 10 }),
  );
  const before = structuredClone(s);
  expect(reorderCommon(s, "d", "b")).toBe(true);
  expect(selectCards(s, "favorites", now).map((c) => c.id)).toEqual([
    "a",
    "d",
    "b",
    "c",
  ]);
  expect(reorderCommon(s, "a", null)).toBe(true);
  expect(selectCards(s, "favorites", now).map((c) => c.id)).toEqual([
    "d",
    "b",
    "c",
    "a",
  ]);
  for (const c of s.cards)
    expect({ ...c, order: 0 }).toEqual({
      ...before.cards.find((x) => x.id === c.id),
      order: 0,
    });
  expect(s.entries).toEqual(before.entries);
  expect(s.changes).toEqual(before.changes);
  expect(s.cards.at(-1)?.order).toBe(10);
  const snapshot = structuredClone(s);
  expect(reorderCommon(s, "a", "a")).toBe(false);
  expect(reorderCommon(s, "a", "missing")).toBe(false);
  expect(s).toEqual(snapshot);
  expect(
    insertBefore([{ id: "a" }, { id: "b" }], "b", "a").map((c) => c.id),
  ).toEqual(["b", "a"]);
});
it("flat navigation keeps categories and storage views distinct, and does not hide historical categories", () => {
  const s = fresh(now, "cn");
  s.cards = [
    card("historical", { category: "曾经的分类", state: "archived" }),
    card("other", { category: "学习" }),
  ];
  expect(collectionOptions(s).map((x) => x.label)).toEqual([
    "全部",
    "常用",
    "计划中",
    "未分类",
    "生活",
    "学习",
    "工作",
    "运动",
    "曾经的分类",
    "弃用",
    "归档",
  ]);
  expect(selectCards(s, "archived", now).map((c) => c.id)).toEqual([
    "historical",
  ]);
  expect(selectCards(s, "category:学习", now).map((c) => c.id)).toEqual([
    "other",
  ]);
  expect(collectionOptions(s, true).map((x) => x.label)).toContain("每日计划");
  expect(collectionOptions(s, true).some((x) => x.id === "archived")).toBe(
    false,
  );
});
