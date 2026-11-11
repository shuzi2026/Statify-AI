import { type Card, type State } from "./model";
import { inWindow, unavailable } from "./engine";
import { planActionIds, planProgress } from "./planning";
import { SHOPPING_CATEGORY } from "../shared/shopping-demo";

export type CollectionId =
  | "all"
  | "favorites"
  | "planned"
  | "shopping"
  | "day"
  | "week"
  | "month"
  | "abandoned"
  | "archived"
  | `category:${string}`;
export type CollectionOption = {
  id: CollectionId;
  label: string;
  group: "view" | "plan" | "category" | "stored";
};
/** Compact system navigation only; saved category names remain unchanged. */
export function collectionRailLabel(item: CollectionOption, english: boolean) {
  if (!english) return item.label;
  const labels: Partial<Record<CollectionId, string>> = {
    favorites: "Favs",
    archived: "Archive",
    "category:": "Unsorted",
  };
  return labels[item.id] ?? item.label;
}
export function collectionOptions(s: State, home = false, showShopping = false): CollectionOption[] {
  const shopping = showShopping || s.cards.some((card) => card.shopping);
  return [
    { id: "all", label: "全部", group: "view" },
    { id: "favorites", label: "常用", group: "view" },
    ...(home
      ? [
          { id: "planned" as const, label: "全部计划", group: "plan" as const },
          ...(["day", "week", "month"] as const).map((id, i) => ({
            id,
            label: ["每日计划", "每周计划", "每月计划"][i],
            group: "plan" as const,
          })),
        ]
      : [{ id: "planned" as const, label: "计划中", group: "view" as const }]),
    { id: "category:", label: "未分类", group: "category" },
    ...[
      ...new Set(
        [...s.categories, ...s.cards.map((c) => c.category)].filter((name) =>
          name && (name !== SHOPPING_CATEGORY || !shopping ||
            s.cards.some((card) => !card.shopping && card.category === name))),
      ),
    ].map((name) => ({
      id: ("category:" + name) as CollectionId,
      label: name,
      group: "category" as const,
    })),
    ...(!home && shopping
      ? [{ id: "shopping" as const, label: SHOPPING_CATEGORY, group: "category" as const }]
      : []),
    ...(!home
      ? [
          { id: "abandoned" as const, label: "弃用", group: "stored" as const },
          { id: "archived" as const, label: "归档", group: "stored" as const },
        ]
      : []),
  ];
}
export function collectionContext(s: State, now: number) {
  const eligible = new Set(planActionIds(s, now)),
    periods = new Map<string, Set<string>>(),
    priority = new Map<string, number>();
  for (const p of s.plans) {
    if (p.scope ? !eligible.has(p.id) : !p.active || p.draft) continue;
    const result = planProgress(s, p, now);
    for (const row of result.counts) {
      const membership = periods.get(row.id) || new Set<string>();
      membership.add(p.period);
      periods.set(row.id, membership);
      if (!result.done && row.value < row.target)
        priority.set(
          row.id,
          Math.min(
            priority.get(row.id) ?? 3,
            { day: 0, week: 1, month: 2 }[p.period],
          ),
        );
    }
  }
  return { periods, priority };
}
const manualOrder = (a: Card, b: Card) =>
  a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
export function selectCards(
  s: State,
  selection: CollectionId,
  now: number,
  context = collectionContext(s, now),
) {
  const state =
    selection === "abandoned"
      ? "abandoned"
      : selection === "archived"
        ? "archived"
        : "active";
  const cards = s.cards
    .filter((c) => c.state === state)
    .filter((c) => {
      if (selection === "shopping") return !!c.shopping;
      if (c.shopping && !["all", "favorites", "abandoned", "archived"].includes(selection)) return false;
      if (selection === "favorites") return c.favorite;
      if (selection === "planned") return context.periods.has(c.id);
      if (["day", "week", "month"].includes(selection))
        return context.periods.get(c.id)?.has(selection);
      if (selection.startsWith("category:"))
        return c.category === selection.slice(9);
      return true;
    });
  if (selection === "favorites") return cards.sort(manualOrder);
  // Cache availability once per card; compare criteria lexicographically.
  const ranks = new Map(
    cards.map((c) => [
      c.id,
      [
        Number(!!unavailable(s, c, now)),
        Number(!inWindow(c, now)),
        context.priority.get(c.id) ?? 3,
      ],
    ]),
  );
  return cards.sort((a, b) => {
    const x = ranks.get(a.id)!,
      y = ranks.get(b.id)!;
    return (
      x[0] - y[0] ||
      x[1] - y[1] ||
      x[2] - y[2] ||
      b.count - a.count ||
      b.createdAt - a.createdAt ||
      a.id.localeCompare(b.id)
    );
  });
}
export function toggleCommon(s: State, id: string) {
  const c = s.cards.find((c) => c.id === id && c.state === "active");
  if (!c) return;
  if (!c.favorite) {
    c.order =
      Math.max(
        -1,
        ...s.cards
          .filter((c) => c.state === "active" && c.favorite)
          .map((c) => c.order),
      ) + 1;
  }
  c.favorite = !c.favorite;
}
export function insertBefore<T extends { id: string }>(
  items: T[],
  id: string,
  before: string | null,
) {
  if (
    id === before ||
    !items.some((c) => c.id === id) ||
    (before !== null && !items.some((c) => c.id === before))
  )
    return items;
  const item = items.find((c) => c.id === id)!,
    others = items.filter((c) => c.id !== id),
    index =
      before === null
        ? others.length
        : others.findIndex((c) => c.id === before);
  return [...others.slice(0, index), item, ...others.slice(index)];
}
export function reorderCommon(s: State, id: string, before: string | null) {
  const original = s.cards
      .filter((c) => c.state === "active" && c.favorite)
      .sort(manualOrder),
    next = insertBefore(original, id, before);
  if (next.every((c, i) => c.id === original[i].id)) return false;
  next.forEach((c, i) => {
    c.order = i;
  });
  return true;
}
