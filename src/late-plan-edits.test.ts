import { ruleContext } from "./payments/access";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { fresh, newCard, type State, type Plan } from "./model";
import {
  newPlan,
  savePlan,
  saveBoardPlan,
  putBoardCard,
  addPlanSlot,
  bounds,
  planLocked,
  planProgress,
  planActionIds,
  recurringProgress,
} from "./planning";
import { start, settle, rollDays, saveCard } from "./engine";
import { collectionContext } from "./card-collection";
import {
  withPlanApplyChoice,
  PlanApplyRequired,
  rememberPlanApplyChoice,
  readPlanApplyChoice,
  hasUpcomingPlanChanges,
  type PlanApplyChoice,
} from "./late-plan-edits";
const at = (day = 12, hour = 23, minute = 0) =>
  new Date(2026, 9, day, hour, minute).getTime();
const yes: PlanApplyChoice = { day: true, week: true, month: true },
  no: PlanApplyChoice = { day: false, week: false, month: false };
let sequence = 0,
  stored: Map<string, string>;
function fixture() {
  const s = fresh(at(12, 8) + sequence++, "cn");
  s.cards = [
    { ...newCard(at(12, 8)), id: "water", name: "喝水", method: "instant" },
    {
      ...newCard(at(12, 8)),
      id: "read",
      name: "阅读",
      method: "duration",
      minutes: 25,
    },
  ];
  return s;
}
function add(s: State, period: Plan["period"] = "day") {
  const p = {
    ...newPlan(at(12, 8)),
    id: period,
    period,
    anchor: "2026-10-12",
    cards: [{ id: "water", target: 2, score: 1 }],
  };
  return savePlan(s, p, at(12, 8), true);
}
function changeAll(s: State) {
  for (const p of [...s.plans])
    savePlan(s, { ...p, cards: [{ id: "water", target: 4, score: 1 }] }, at());
}
beforeEach(() => {
  stored = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => stored.get(k) || null,
    setItem: (k: string, v: string) => stored.set(k, v),
  });
});
afterEach(() => vi.unstubAllGlobals());

it("allows editing at 23:00 and locks only ended date-specific periods", () => {
  const s = fixture(),
    p = add(s);
  expect(planLocked(p, at())).toBe(false);
  expect(() => savePlan(s, { ...p, cards: [] }, at())).not.toThrow();
  const once = {
    ...newPlan(at(12, 8)),
    id: "once",
    scope: "once" as const,
    cards: [{ id: "water", target: 1 }],
    anchor: "2026-10-12",
  };
  savePlan(s, once, at(12, 8), true);
  expect(() => savePlan(s, once, at())).not.toThrow();
  expect(() => savePlan(s, once, at(13, 0))).toThrow(/周期已结束/);
});
it("asks after 23:00 for all edited current repeating periods, even before the week or month ends", () => {
  const s = fixture();
  for (const p of ["day", "week", "month"] as const) add(s, p);
  try {
    withPlanApplyChoice(structuredClone(s), changeAll, at());
    throw Error("missing question");
  } catch (e) {
    expect(e).toBeInstanceOf(PlanApplyRequired);
    expect((e as PlanApplyRequired).periods).toEqual(["day", "week", "month"]);
  }
});
it("does not ask before 23:00, for mere card renaming, or when recording an action", () => {
  const s = fixture(),
    p = add(s);
  expect(() =>
    withPlanApplyChoice(
      s,
      (st) => savePlan(st, { ...p, cards: [] }, at(12, 22)),
      at(12, 22),
    ),
  ).not.toThrow();
  expect(() =>
    withPlanApplyChoice(
      s,
      (st) =>
        saveCard(st, { ...st.cards[0], name: "喝一杯水" }, ruleContext(at())),
      at(),
    ),
  ).not.toThrow();
  expect(() =>
    withPlanApplyChoice(s, (st) => start(st, "water", at()), at()),
  ).not.toThrow();
});
it("applies selected periods and retains unselected cycle requirements, history and completion data", () => {
  const s = fixture();
  for (const p of ["day", "week", "month"] as const) add(s, p);
  const id = start(s, "water", at(12, 10));
  settle(
    s,
    id,
    { seconds: 0, quantity: 1, rating: 1, counted: true, note: "原记录" },
    ruleContext(at(12, 10) + 1),
  );
  const history = JSON.stringify(s.entries),
    cycles = structuredClone(s.planCycles);
  withPlanApplyChoice(s, changeAll, at(), {
    day: false,
    week: true,
    month: false,
  });
  expect(s.plans.map((p) => p.cards[0].target)).toEqual([4, 4, 4]);
  expect(s.planCycles.map((c) => c.cards[0].target)).toEqual([2, 4, 2]);
  expect(JSON.stringify(s.entries)).toBe(history);
  expect(s.planCycles[0]).toEqual(cycles[0]);
  expect(hasUpcomingPlanChanges(s, s.plans[0], at())).toBe(true);
});
it.each(["day", "week", "month"] as const)(
  "defers a new %s plan to its next calendar boundary when not applied now",
  (period) => {
    const s = fixture();
    withPlanApplyChoice(
      s,
      (st) =>
        putBoardCard(
          st,
          { ...newPlan(at()), period, anchor: "2026-10-12" },
          "water",
          at(),
        ),
      at(),
      no,
    );
    const p = s.plans[0],
      next = bounds(period, at()).end;
    expect(p.startsAt).toBe(next);
    expect(s.planCycles.filter((c) => c.startsAt <= at())).toHaveLength(0);
    expect(planActionIds(s, at())).toHaveLength(0);
    rollDays(s, next + 1);
    expect(
      s.planCycles.some((c) => c.planId === p.id && c.start === next),
    ).toBe(true);
  },
);
it("retains this cycle after clearing a repeating template, including home filters and reminders", () => {
  const s = fixture(),
    p = add(s);
  addPlanSlot(s, p.id, "water", "1", "23:10", at(12, 8));
  const prior = structuredClone(s.planCycles[0]);
  s.messages.push({
    id: "notice",
    planId: p.id,
    slotId: p.slots?.[0]?.id || s.plans[0].slots![0].id,
    cardId: "water",
    name: "喝水",
    dueAt: at(12, 23, 10),
    kind: "scheduled",
    read: false,
  });
  withPlanApplyChoice(
    s,
    (st) => saveBoardPlan(st, { ...st.plans[0], cards: [], slots: [] }, at()),
    at(),
    no,
  );
  expect(s.planCycles[0]).toEqual(prior);
  expect(s.messages[0].read).toBe(false);
  expect(planActionIds(s, at())).toContain(p.id);
  expect(collectionContext(s, at()).periods.has("water")).toBe(true);
  expect(recurringProgress(s, "day", at())?.target).toBe(2);
  expect(planProgress(s, s.plans[0], at()).target).toBe(2);
  rollDays(s, at(13, 1));
  expect(recurringProgress(s, "day", at(13, 1))).toBeNull();
});
it("leaves historical cycles unchanged and adopts deferred requirements when the next cycle starts", () => {
  const s = fixture();
  add(s);
  withPlanApplyChoice(s, changeAll, at(), no);
  const previous = structuredClone(s.planCycles[0]);
  rollDays(s, at(13, 1));
  expect(s.planCycles.find((c) => c.key === "2026-10-12")).toEqual(previous);
  expect(
    s.planCycles.find((c) => c.key === "2026-10-13")?.cards[0].target,
  ).toBe(4);
});
it("permits fixed-duration card edits after 23:00 without the old deadline error", () => {
  const s = fixture();
  add(s);
  addPlanSlot(s, "day", "read", "1", "23:10", at(12, 8));
  withPlanApplyChoice(
    s,
    (st) => saveCard(st, { ...st.cards[1], minutes: 30 }, ruleContext(at())),
    at(),
    yes,
  );
  expect(s.plans[0].slots![0].minutes).toBe(30);
  expect(s.planCycles[0].slots![0].minutes).toBe(30);
});
it("rejects conflicts between retained current reservations and newly applied ones", () => {
  const s = fixture(),
    d = add(s),
    w = add(s, "week");
  addPlanSlot(s, d.id, "read", "1", "23:30", at(12, 8));
  addPlanSlot(s, w.id, "read", "1", "23:55", at(12, 8));
  expect(() =>
    withPlanApplyChoice(
      s,
      (st) => {
        for (const p of [...st.plans])
          savePlan(
            st,
            {
              ...p,
              slots: p.slots!.map((slot) => ({
                ...slot,
                time: p.period === "day" ? "23:00" : "23:40",
              })),
            },
            at(),
          );
      },
      at(),
      { day: false, week: true, month: true },
    ),
  ).toThrow(/本期保留/);
});
it("checks retained overnight reservations against the next occurrence of the same repeating slot", () => {
  const s = fixture(),
    p = add(s);
  addPlanSlot(s, p.id, "read", "1", "23:50", at(12, 8));
  expect(() =>
    withPlanApplyChoice(
      s,
      (st) =>
        savePlan(
          st,
          {
            ...st.plans[0],
            slots: st.plans[0].slots!.map((slot) => ({
              ...slot,
              time: "00:05",
            })),
          },
          at(),
        ),
      at(),
      no,
    ),
  ).toThrow(/本期保留/);
});
it("keeps overnight reservations protected after the clock passes midnight", () => {
  const s = fixture(),
    p = add(s);
  addPlanSlot(s, p.id, "read", "1", "23:50", at(12, 8));
  withPlanApplyChoice(
    s,
    (st) =>
      savePlan(
        st,
        {
          ...st.plans[0],
          slots: st.plans[0].slots!.map((slot) => ({ ...slot, time: "01:00" })),
        },
        at(),
      ),
    at(),
    no,
  );
  rollDays(s, at(13, 0));
  expect(() =>
    withPlanApplyChoice(
      s,
      (st) =>
        savePlan(
          st,
          {
            ...st.plans[0],
            slots: st.plans[0].slots!.map((slot) => ({
              ...slot,
              time: "00:05",
            })),
          },
          at(13, 0),
        ),
      at(13, 0),
    ),
  ).toThrow(/本期保留/);
});
it("remembers a confirmed choice for exactly 30 minutes without extending it on reads", () => {
  const s = fixture();
  rememberPlanApplyChoice(s, no, at());
  expect(readPlanApplyChoice(s, at(12, 23, 29))).toEqual(no);
  expect(readPlanApplyChoice(s, at() + 30 * 60000 - 1)).toEqual(no);
  expect(readPlanApplyChoice(s, at() + 30 * 60000)).toBeUndefined();
  expect(readPlanApplyChoice(s, at() - 1)).toBeUndefined();
  expect(readPlanApplyChoice(fixture(), at())).toBeUndefined();
});
it("a failed preference write cannot restore an older choice over the user's latest answer", () => {
  const s = fixture();
  rememberPlanApplyChoice(s, yes, at());
  vi.spyOn(localStorage, "setItem").mockImplementationOnce(() => {
    throw new DOMException(
      "Synthetic full preference store",
      "QuotaExceededError",
    );
  });
  rememberPlanApplyChoice(s, no, at() + 1000);
  expect(readPlanApplyChoice(s, at() + 1001)).toEqual(no);
  const p = add(s);
  withPlanApplyChoice(
    s,
    () =>
      savePlan(
        s,
        { ...p, cards: [{ id: "water", target: 4, score: 1 }] },
        at() + 1001,
      ),
    at() + 1001,
    readPlanApplyChoice(s, at() + 1001),
  );
  expect(
    s.planCycles.find((c) => c.planId === p.id && c.end > at())?.cards[0]
      .target,
  ).toBe(2);
});
it("a newer valid choice from another page wins, while malformed persisted data cannot mask a valid local answer", () => {
  const s = fixture(),
    key = "statify-late-plan-choice:" + s.region + ":" + s.createdAt;
  rememberPlanApplyChoice(s, no, at());
  stored.set(
    key,
    JSON.stringify({ at: at() + 1000, until: at() + 1801000, choice: yes }),
  );
  expect(readPlanApplyChoice(s, at() + 1001)).toEqual(yes);
  stored.set(
    key,
    JSON.stringify({ at: at() + 1000, until: at() + 1801001, choice: yes }),
  );
  expect(readPlanApplyChoice(s, at() + 1001)).toEqual(no);
  expect(readPlanApplyChoice(s, at() + 1800000)).toBeUndefined();
});
it("accepts a persisted choice after reopening, rejects invalid records, and works in memory if storage is unavailable", () => {
  const s = fixture();
  stored.set(
    "statify-late-plan-choice:" + s.region + ":" + s.createdAt,
    JSON.stringify({ at: at(), until: at() + 1800000, choice: yes }),
  );
  expect(readPlanApplyChoice(s, at() + 1)).toEqual(yes);
  stored.set(
    [...stored.keys()][0],
    JSON.stringify({ at: at(), until: at() + 1800001, choice: yes }),
  );
  expect(readPlanApplyChoice(s, at() + 1)).toBeUndefined();
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw Error("blocked");
    },
    setItem: () => {
      throw Error("blocked");
    },
  });
  rememberPlanApplyChoice(s, no, at());
  expect(readPlanApplyChoice(s, at() + 1)).toEqual(no);
});
