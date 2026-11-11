import { formerCutoff } from "../tests/helpers/former-cutoff";
import { it, expect } from "vitest";
import { fresh, newCard, type Entry } from "./model";
import { entryIndex, planEntries } from "./entry-index";
import { execution } from "./engine";
import { bounds, planMessages, newPlan } from "./planning";
const at = new Date("2026-10-14T12:00:00").getTime();
function entry(id: string, start = at, end = start): Entry {
  return {
    id,
    cardId: "book",
    name: "读书",
    method: "instant",
    startedAt: start,
    endedAt: end,
    date: "2026-10-14",
    seconds: 0,
    measured: 0,
    quantity: 1,
    counted: true,
    rating: 1,
    coefficient: 1,
    note: "",
    score: 1,
    plans: ["plan"],
    rewards: [],
    effects: [],
    values: [],
    legacy: false,
  };
}
it("queries indexed plans by start time, excluding uncounted and future completions", () => {
  const rows = [
    entry("late", at + 2, at + 5),
    entry("early", at - 1),
    { ...entry("partial"), counted: false },
    entry("now"),
  ];
  Object.freeze(rows);
  expect(
    planEntries(rows, "plan", at, at + 3, at + 3).map((e) => e.id),
  ).toEqual(["now"]);
  expect(entryIndex(rows)).toBe(entryIndex(rows));
  expect(entryIndex(rows).byCard.get("book")).toHaveLength(4);
});
it("does not cache mutable engine drafts or return stale data after appending", () => {
  const rows = [entry("first")];
  const first = entryIndex(rows);
  rows.push(entry("second"));
  expect(entryIndex(rows)).not.toBe(first);
  expect(planEntries(rows, "plan", at, at + 1)).toHaveLength(2);
});
it("groups overnight actions by completion day rather than start day", () => {
  const end = new Date("2026-10-15T00:10:00").getTime(),
    rows = [entry("overnight", at, end)];
  expect(entryIndex(rows).byDay.get("2026-10-15")).toHaveLength(1);
  expect(entryIndex(rows).byDay.get("2026-10-14")).toBeUndefined();
});
it("execution cache respects future completion and clock rollback across the former cutoff", () => {
  const s = fresh(at, "cn"),
    b = bounds("day", at),
    deadline = formerCutoff("day", at);
  s.planCycles = [
    {
      ...b,
      id: "cycle",
      planId: "plan",
      startsAt: at,
      mode: "cards",
      target: 1,
      cards: [{ id: "book", target: 1 }],
      scope: "repeat",
      period: "day",
    },
  ];
  s.entries = [entry("late", at, deadline + 60000)];
  Object.freeze(s.entries);
  expect(execution(s, deadline).level).toBe(0);
  const result = execution(s, deadline + 60000);
  expect(result.level).toBe(1);
  expect(execution(s, deadline + 61000)).toBe(result);
  expect(execution(s, deadline - 1).level).toBe(0);
  const changed = { ...s, entries: [] };
  Object.freeze(changed.entries);
  expect(execution(changed, deadline + 60000).level).toBe(0);
});
it("reminder cache expires exactly at its scheduled minute and promotion to inbox", () => {
  const s = fresh(at, "cn"),
    c = { ...newCard(at), name: "读书" },
    b = bounds("day", at),
    p = {
      ...newPlan(at),
      id: "plan",
      draft: false,
      active: true,
      startsAt: at,
      cards: [{ id: c.id, target: 1 }],
      timeline: true,
      slots: [
        {
          id: "slot",
          cardId: c.id,
          day: "1",
          time: "12:01",
          minutes: 0,
          configured: true,
        },
      ],
    };
  s.cards = [c];
  s.plans = [p];
  s.planCycles = [
    {
      ...b,
      id: "cycle",
      planId: p.id,
      startsAt: at,
      mode: "cards",
      target: 1,
      cards: p.cards,
      scope: "repeat",
      period: "day",
      timeline: true,
      slots: p.slots,
    },
  ];
  Object.freeze(s.entries);
  expect(planMessages(s, at).live).toHaveLength(0);
  const live = planMessages(s, at + 60000);
  expect(live.live).toHaveLength(1);
  expect(planMessages(s, at + 119999)).toBe(live);
  expect(planMessages(s, at + 120000).notices).toHaveLength(1);
  expect(planMessages(s, at).live).toHaveLength(0);
});
