import { ruleContext } from "./payments/access";
import { formerCutoff } from "../tests/helpers/former-cutoff";
import { describe, it, expect } from "vitest";
import { fresh, newCard, type Plan, type State } from "./model";
import {
  newPlan,
  savePlan,
  addPlanSlot,
  updatePlanSlot,
  bounds,
  planProgress,
  recurringProgress,
  planMessages,
  syncPlanMessages,
  putBoardCard,
  saveBoardPlan,
  findBoardPlan,
} from "./planning";
import {
  start,
  settle,
  execution,
  rollDays,
  saveCard,
  freeze,
  progress,
} from "./engine";
import { validateState } from "./migrate";
const time = (day = 12, hour = 8, minute = 0, month = 9) =>
  new Date(2026, month, day, hour, minute).getTime();
const input = { seconds: 0, quantity: 1, rating: 1, counted: true, note: "" };
function fixture() {
  const s = fresh(time(), "cn");
  s.cards = [
    {
      ...newCard(time()),
      id: "water",
      name: "喝水",
      method: "instant",
      score: 3,
    },
    {
      ...newCard(time()),
      id: "read",
      name: "阅读",
      method: "duration",
      minutes: 25,
      score: 1,
    },
  ];
  return s;
}
function plan(
  s: State,
  period: Plan["period"] = "day",
  extra: Partial<Plan> = {},
  now = time(),
) {
  const p = {
    ...newPlan(now),
    id: period + ":" + (extra.scope || "repeat"),
    period,
    anchor: "2026-10-12",
    cards: [{ id: "water", target: 3, score: 2 }],
    ...extra,
  };
  savePlan(s, p, now, true);
  return s.plans.find((x) => x.id === p.id)!;
}
function complete(s: State, now: number) {
  const id = start(s, "water", now);
  return settle(s, id, input, ruleContext(now));
}
describe("plan targets and execution rewards", () => {
  it("rejects daily plan targets above a card daily cap without mutation", () => {
    const s = fixture();
    s.cards[0].cap = 2;
    const before = JSON.stringify(s);
    expect(() => plan(s)).toThrow(/每天最多完成2次/);
    expect(JSON.stringify(s)).toBe(before);
    expect(() =>
      plan(s, "day", { cards: [{ id: "water", target: 2, score: 1 }] }),
    ).not.toThrow();
    expect(() => plan(s, "week")).not.toThrow();
  });
  it("rejects incrementing a capped daily plan and lowering its card limit below its target", () => {
    const s = fixture();
    s.cards[0].cap = 3;
    const p = plan(s);
    const before = JSON.stringify(s);
    expect(() => putBoardCard(s, p, "water", time(), undefined, true)).toThrow(
      /每天最多完成3次/,
    );
    expect(() =>
      saveCard(s, { ...s.cards[0], cap: 2 }, ruleContext(time())),
    ).toThrow(/关联每日计划/);
    expect(JSON.stringify(s)).toBe(before);
  });
  it("uses plan-local score, caps each card at planned count and permits a shared completion", () => {
    const s = fixture();
    for (const period of ["day", "week", "month"] as const)
      plan(s, period, { mode: "score", target: 6 });
    s.cards[0].score = 0;
    for (let i = 1; i <= 4; i++) complete(s, time() + i);
    for (const p of s.plans)
      expect(planProgress(s, p, time() + 5)).toMatchObject({
        value: 6,
        target: 6,
        done: true,
      });
    expect(execution(s, time() + 5).level).toBe(9);
    rollDays(s, time() + 20);
    expect(execution(s, time() + 20).level).toBe(9);
    expect(execution(s, time(12, 23)).level).toBe(9);
  });
  it("counts total requested uses with a separate cap on each card", () => {
    const s = fixture();
    s.cards.push({ ...newCard(time()), id: "other", name: "另一张" });
    const p = plan(s, "day", {
      cards: [
        { id: "water", target: 4, score: 1 },
        { id: "other", target: 10, score: 1 },
      ],
    });
    for (let i = 0; i < 5; i++) complete(s, time() + i);
    expect(planProgress(s, p, time() + 10)).toMatchObject({
      value: 4,
      target: 14,
      done: false,
    });
  });
  it("excludes preactivation actions but includes date-specific daily plans in the daily grade", () => {
    const s = fixture(),
      id = start(s, "water", time());
    const p = plan(
      s,
      "day",
      { scope: "once", cards: [{ id: "water", target: 1, score: 1 }] },
      time() + 1000,
    );
    settle(s, id, input, ruleContext(time() + 2000));
    expect(planProgress(s, p, time() + 2000).value).toBe(0);
    complete(s, time() + 3000);
    expect(planProgress(s, p, time() + 3000).done).toBe(true);
    expect(recurringProgress(s, "day", time() + 3000)).toBeNull();
    expect(execution(s, time() + 3000).level).toBe(1);
  });
  it("shared completion earns each period reward immediately and retains it across boundaries", () => {
    const s = fixture();
    for (const period of ["day", "week", "month"] as const)
      plan(s, period, { cards: [{ id: "water", target: 1, score: 1 }] });
    complete(s, time() + 1);
    expect(execution(s, time() + 1).level).toBe(9);
    rollDays(s, time(16));
    expect(execution(s, time(16)).level).toBe(9);
    rollDays(s, time(31));
    expect(execution(s, time(31)).level).toBe(9);
    const empty = fixture();
    plan(empty);
    rollDays(empty, time(20));
    expect(execution(empty, time(20)).level).toBe(0);
  });
  it("keeps repeating and one-off plans separate and rejects a second repeating plan", () => {
    const s = fixture();
    plan(s);
    expect(() =>
      savePlan(s, { ...newPlan(time()), id: "duplicate" }, time()),
    ).toThrow(/已有计划/);
    plan(s, "day", { scope: "once" });
    expect(s.plans).toHaveLength(2);
  });
  it("rejects impossible scores and duplicate cards without modifying the stored plan", () => {
    const s = fixture();
    const p = plan(s),
      before = JSON.stringify(s);
    expect(() =>
      savePlan(s, { ...p, mode: "score", target: 7 }, time()),
    ).toThrow(/总分/);
    expect(() =>
      savePlan(s, { ...p, cards: [...p.cards, ...p.cards] }, time()),
    ).toThrow(/重复/);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("audit regressions", () => {
  it("one ongoing action only covers one scheduled occurrence of the same card", () => {
    const s = fixture(),
      p = plan(s, "day", { cards: [{ id: "read", target: 2, score: 1 }] });
    addPlanSlot(s, p.id, "read", "1", "09:00", time());
    addPlanSlot(s, p.id, "read", "1", "10:00", time());
    start(s, "read", time(12, 8, 59));
    expect(planMessages(s, time(12, 9)).live).toHaveLength(0);
    expect(planMessages(s, time(12, 10)).live).toHaveLength(1);
  });
  it("equal-time occurrences have separate completion ordinals", () => {
    const s = fixture(),
      p = plan(s, "day", { cards: [{ id: "water", target: 2, score: 1 }] });
    addPlanSlot(s, p.id, "water", "1", "09:00", time());
    addPlanSlot(s, p.id, "water", "1", "09:00", time());
    complete(s, time(12, 8, 59));
    expect(planMessages(s, time(12, 9)).live).toHaveLength(1);
  });
  it("late settlement keeps daily success before subsequent failures", () => {
    const s = fixture();
    plan(s, "day", { cards: [{ id: "read", target: 1, score: 1 }] });
    const id = start(s, "read", time());
    freeze(s, id, time(12, 8, 1));
    rollDays(s, time(16));
    settle(s, id, { ...input, seconds: 60 }, ruleContext(time(16)));
    expect(execution(s, time(16)).level).toBe(1);
  });
  it("keeps legacy progress visible until the user converts the plan", () => {
    const s = fixture(),
      p: Plan = {
        id: "legacy",
        name: "旧计划",
        period: "day",
        mode: "score",
        target: 6,
        cards: [],
        active: true,
        createdAt: time(),
      };
    s.plans.push(p);
    s.dailyPlan = p.id;
    complete(s, time() + 1);
    expect(planProgress(s, p, time() + 2)).toMatchObject(
      progress(s, p, time() + 2),
    );
    expect(recurringProgress(s, "day", time() + 2)).toMatchObject({
      value: 3,
      target: 6,
    });
  });
  it("lets an unstarted empty plan correct its scope and date", () => {
    const s = fixture(),
      p = newPlan(time());
    savePlan(s, p, time());
    expect(() =>
      savePlan(
        s,
        { ...s.plans[0], scope: "once", period: "week", anchor: "2026-10-19" },
        time(),
      ),
    ).not.toThrow();
  });
  it("rejects duration edits that overlap another planned task, without changing data", () => {
    const s = fixture(),
      p = plan(s, "day", { cards: [{ id: "read", target: 2, score: 1 }] });
    addPlanSlot(s, p.id, "read", "1", "09:00", time());
    addPlanSlot(s, p.id, "read", "1", "09:25", time());
    const before = JSON.stringify(s);
    expect(() =>
      saveCard(s, { ...s.cards[1], minutes: 60 }, ruleContext(time())),
    ).toThrow(/占用/);
    expect(JSON.stringify(s)).toBe(before);
  });
  it("does not apply an expired one-off reservation to a newly arranged repeating cycle", () => {
    const s = fixture(),
      once = plan(s, "day", {
        scope: "once",
        cards: [{ id: "read", target: 1, score: 1 }],
      }),
      weekly = plan(s, "week", {
        cards: [{ id: "read", target: 1, score: 1 }],
      });
    addPlanSlot(s, once.id, "read", "2026-10-12", "09:00", time());
    expect(() =>
      addPlanSlot(s, weekly.id, "read", "1", "09:00", time(19)),
    ).not.toThrow();
  });
  it("updates future duration reservations while keeping ended cycles unchanged", () => {
    const s = fixture(),
      p = plan(s, "day", { cards: [{ id: "read", target: 1, score: 1 }] });
    addPlanSlot(s, p.id, "read", "1", "09:00", time());
    rollDays(s, time(13));
    saveCard(s, { ...s.cards[1], minutes: 60 }, ruleContext(time(13)));
    expect(s.plans[0].slots![0].minutes).toBe(60);
    expect(
      s.planCycles.find((c) => c.key === "2026-10-12")!.slots![0].minutes,
    ).toBe(25);
    expect(
      s.planCycles.find((c) => c.key === "2026-10-13")!.slots![0].minutes,
    ).toBe(60);
  });
  it("keeps an overnight one-off interval reserved even after its calendar day ends", () => {
    const s = fixture(),
      p = plan(s, "day", {
        scope: "once",
        cards: [{ id: "read", target: 1, score: 1 }],
      });
    addPlanSlot(s, p.id, "read", "2026-10-12", "23:50", time());
    const next = plan(
      s,
      "week",
      { cards: [{ id: "water", target: 1, score: 1 }] },
      time(13, 0),
    );
    expect(() =>
      addPlanSlot(s, next.id, "water", "2", "00:10", time(13, 0)),
    ).toThrow(/占用/);
  });
});
describe("plan cutoffs and calendar", () => {
  it.each([
    ["day", time(12, 23)],
    ["week", time(18, 23)],
    ["month", time(31, 23)],
  ] as const)(
    "allows %s plan changes after its former settlement time",
    (period, at) => {
      const s = fixture(),
        p = plan(s, period);
      expect(() =>
        savePlan(
          s,
          { ...p, cards: [{ id: "water", target: 1, score: 1 }] },
          at,
        ),
      ).not.toThrow();
      const other = fixture();
      expect(() =>
        savePlan(other, { ...newPlan(at), period, anchor: "2026-10-12" }, at),
      ).not.toThrow();
    },
  );
  it("allows a future plan after the current cutoff and does not activate it early", () => {
    const s = fixture(),
      at = time(12, 23);
    const p = {
      ...newPlan(at),
      anchor: "2026-10-13",
      cards: [{ id: "water", target: 1, score: 1 }],
    };
    savePlan(s, p, at, true);
    expect(recurringProgress(s, "day", at)).toBeNull();
    complete(s, at + 1);
    rollDays(s, time(13));
    expect(recurringProgress(s, "day", time(13))?.value).toBe(0);
    complete(s, time(13) + 1);
    expect(execution(s, time(13) + 1).level).toBe(1);
    expect(execution(s, time(13, 23)).level).toBe(1);
  });
  it("validates actual dates and uses calendar boundaries for weeks and month end", () => {
    expect(bounds("week", time(18)).key).toBe("2026-10-12");
    expect(formerCutoff("month", time())).toBe(time(31, 23));
    const s = fixture();
    expect(() =>
      savePlan(s, { ...newPlan(time()), anchor: "2026-02-30" }, time()),
    ).toThrow(/日期/);
    expect(() =>
      validateState({
        ...s,
        plans: [{ ...newPlan(time()), anchor: "2026-02-30" }],
      }),
    ).toThrow(/日期/);
  });
});
describe("one-to-many timeline and reminder lifecycle", () => {
  it("keeps a unique requirement and increases its target for an extra arrangement", () => {
    const s = fixture(),
      p = plan(s);
    for (const t of ["09:00", "12:00", "18:00", "20:00"])
      addPlanSlot(s, p.id, "water", "1", t, time());
    const next = s.plans[0];
    expect(next.cards).toHaveLength(1);
    expect(next.cards[0].target).toBe(4);
    expect(next.slots).toHaveLength(4);
    savePlan(s, { ...next, cards: [], slots: [] }, time());
    expect(s.plans[0].slots).toHaveLength(0);
  });
  it("locks fixed-duration ranges across plans, including overnight, while allowing adjacent starts", () => {
    const s = fixture();
    const p = plan(s, "day", { cards: [{ id: "read", target: 3, score: 1 }] });
    addPlanSlot(s, p.id, "read", "1", "09:00", time());
    expect(() => addPlanSlot(s, p.id, "read", "1", "09:10", time())).toThrow(
      /占用/,
    );
    addPlanSlot(s, p.id, "read", "1", "09:25", time());
    addPlanSlot(s, p.id, "read", "1", "23:50", time());
    const w = plan(s, "week", {
      cards: [{ id: "water", target: 2, score: 1 }],
    });
    expect(() => addPlanSlot(s, w.id, "water", "2", "00:10", time())).toThrow(
      /占用/,
    );
  });
  it("retains date-only choices and sends them to the inbox without a one-minute live reminder", () => {
    const s = fixture(),
      p = plan(s, "week");
    addPlanSlot(s, p.id, "water", "2", "", time());
    rollDays(s, time(13));
    expect(planMessages(s, time(13)).live).toHaveLength(0);
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].kind).toBe("date");
    rollDays(s, time(13) + 1000);
    expect(s.messages).toHaveLength(1);
  });
  it("shows a reminder for one minute, then persists one unread message; starting clears it", () => {
    const s = fixture(),
      p = plan(s);
    addPlanSlot(s, p.id, "water", "1", "09:00", time());
    expect(planMessages(s, time(12, 9)).live).toHaveLength(1);
    expect(planMessages(s, time(12, 9, 1)).live).toHaveLength(0);
    syncPlanMessages(s, time(12, 9, 1));
    syncPlanMessages(s, time(12, 9, 2));
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].read).toBe(false);
    complete(s, time(12, 9, 3));
    expect(s.messages[0].read).toBe(true);
    expect(planMessages(s, time(12, 9, 3)).live).toHaveLength(0);
  });
  it("does not issue a missed reminder when the user starts within the live minute", () => {
    const s = fixture(),
      p = plan(s);
    addPlanSlot(s, p.id, "read", "1", "09:00", time());
    start(s, "read", time(12, 9) + 30000);
    syncPlanMessages(s, time(12, 9, 2));
    expect(s.messages).toHaveLength(0);
  });
  it("catches missed reminders after a period ends and keeps prior arrangement snapshots", () => {
    const s = fixture(),
      p = plan(s);
    addPlanSlot(s, p.id, "water", "1", "09:00", time());
    rollDays(s, time(13, 8));
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].dueAt).toBe(time(12, 9));
    const next = { ...s.plans[0], slots: [] };
    savePlan(s, next, time(13, 8));
    expect(
      s.planCycles.find((c) => c.key === "2026-10-12")?.slots,
    ).toHaveLength(1);
  });
  it("preserves legacy daily rewards while capping the new daily reward in the same calendar day", () => {
    const s = fixture(),
      p = plan(s, "day", { cards: [{ id: "water", target: 1, score: 1 }] });
    complete(s, time() + 1);
    s.days.find((d) => d.date === "2026-10-12")!.enabled = true;
    s.days.find((d) => d.date === "2026-10-12")!.planId = p.id;
    s.days.find((d) => d.date === "2026-10-12")!.target = 1;
    expect(execution(s, time() + 2).level).toBe(1);
    expect(execution(s, time(12, 23)).level).toBe(1);
  });
  it("does not backfill a date-only reminder before the first activation date", () => {
    const s = fixture(),
      p = plan(s, "week", {}, time(13));
    addPlanSlot(s, p.id, "water", "1", "", time(13));
    syncPlanMessages(s, time(13));
    expect(s.messages).toHaveLength(0);
    rollDays(s, time(19));
    expect(s.messages).toHaveLength(1);
  });
  it("marks the old missed arrangement read and permits a rescheduled reminder", () => {
    const s = fixture(),
      p = plan(s);
    addPlanSlot(s, p.id, "water", "1", "09:00", time());
    syncPlanMessages(s, time(12, 9, 2));
    updatePlanSlot(
      s,
      p.id,
      s.plans[0].slots![0].id,
      "1",
      "10:00",
      time(12, 9, 3),
    );
    expect(s.messages[0].read).toBe(true);
    expect(planMessages(s, time(12, 10)).live).toHaveLength(1);
    syncPlanMessages(s, time(12, 10, 2));
    expect(s.messages).toHaveLength(2);
    expect(s.messages[1].read).toBe(false);
  });
  it("does not remind while an early-started task is already running", () => {
    const s = fixture(),
      p = plan(s);
    addPlanSlot(s, p.id, "read", "1", "09:00", time());
    start(s, "read", time(12, 8, 59));
    expect(planMessages(s, time(12, 9)).live).toHaveLength(0);
    syncPlanMessages(s, time(12, 9, 2));
    expect(s.messages).toHaveLength(0);
  });
});

describe("direct planning from card membership", () => {
  it("activates the first dropped card and increments a repeated drop without duplicate goals", () => {
    const s = fixture(),
      p = newPlan(time());
    putBoardCard(s, p, "water", time());
    putBoardCard(s, p, "water", time() + 1);
    expect(s.plans).toHaveLength(1);
    expect(s.plans[0]).toMatchObject({
      active: true,
      draft: false,
      startsAt: time(),
      cards: [{ id: "water", target: 2, score: 1 }],
    });
    complete(s, time() + 2);
    expect(recurringProgress(s, "day", time() + 2)).toMatchObject({
      value: 1,
      target: 2,
      done: false,
    });
    complete(s, time() + 3);
    expect(execution(s, time() + 3).level).toBe(1);
    expect(execution(s, time(12, 23)).level).toBe(1);
  });
  it("grows scheduled repetitions atomically and preserves a plan when the new slot conflicts", () => {
    const s = fixture(),
      p = { ...newPlan(time()), timeline: true };
    putBoardCard(s, p, "read", time(), { day: "1", time: "09:00" });
    const before = JSON.stringify(s);
    expect(() =>
      putBoardCard(s, p, "read", time() + 1, { day: "1", time: "09:10" }),
    ).toThrow(/占用/);
    expect(JSON.stringify(s)).toBe(before);
    putBoardCard(s, p, "read", time() + 2, { day: "1", time: "09:25" });
    expect(s.plans[0].cards).toHaveLength(1);
    expect(s.plans[0].cards[0].target).toBe(2);
    expect(s.plans[0].slots).toHaveLength(2);
  });
  it("uses manually reserved repetitions before automatically growing the scheduled target", () => {
    const s = fixture();
    putBoardCard(s, newPlan(time()), "water", time());
    saveBoardPlan(
      s,
      {
        ...s.plans[0],
        cards: [{ id: "water", target: 3, score: 1 }],
        timeline: true,
      },
      time(),
    );
    for (const t of ["09:00", "12:00", "18:00"])
      putBoardCard(s, s.plans[0], "water", time(), { day: "1", time: t });
    expect(s.plans[0].cards[0].target).toBe(3);
    putBoardCard(s, s.plans[0], "water", time(), { day: "1", time: "20:00" });
    expect(s.plans[0].cards[0].target).toBe(4);
  });
  it("removing the last card stops future targets and readding starts a new effective boundary", () => {
    const s = fixture(),
      p = putBoardCard(s, newPlan(time()), "water", time()).plan,
      id = start(s, "water", time() + 1);
    saveBoardPlan(s, { ...p, cards: [], slots: [] }, time() + 2);
    expect(s.plans[0].active).toBe(false);
    expect(s.planCycles[0].cards).toHaveLength(0);
    expect(recurringProgress(s, "day", time() + 2)).toBeNull();
    const resumed = putBoardCard(s, s.plans[0], "water", time() + 3).plan;
    settle(s, id, input, ruleContext(time() + 4));
    expect(planProgress(s, resumed, time() + 4).value).toBe(0);
    complete(s, time() + 5);
    expect(planProgress(s, resumed, time() + 5).done).toBe(true);
    saveBoardPlan(s, { ...s.plans[0], cards: [] }, time() + 6);
    rollDays(s, time(16));
    expect(execution(s, time(16))).toMatchObject({ level: 0, streak: 0 });
  });
  it("keeps date selections independent, includes future dates and allows late edits", () => {
    const s = fixture(),
      one = {
        ...newPlan(time()),
        scope: "once" as const,
        anchor: "2026-10-13",
      };
    putBoardCard(s, one, "water", time());
    putBoardCard(
      s,
      { ...newPlan(time()), scope: "once", anchor: "2026-10-14" },
      "read",
      time(),
    );
    expect(
      findBoardPlan(s, "once", "day", "2026-10-13", time())!.cards[0].id,
    ).toBe("water");
    expect(
      findBoardPlan(s, "once", "day", "2026-10-14", time())!.cards[0].id,
    ).toBe("read");
    expect(recurringProgress(s, "day", time())).toBeNull();
    const daily = putBoardCard(s, newPlan(time()), "water", time()).plan;
    expect(() => putBoardCard(s, daily, "water", time(12, 23))).not.toThrow();
    expect(() =>
      saveBoardPlan(
        s,
        { ...s.plans.find((p) => p.id === daily.id)!, cards: [] },
        time(12, 23),
      ),
    ).not.toThrow();
  });
});

describe("period-wide timeline placeholders", () => {
  for (const period of ["week", "month"] as const) {
    it(`${period}: blank dates survive cancel/reopen and never schedule a reminder`, () => {
      const s = fixture(),
        now = time();
      const p = {
        ...newPlan(now),
        scope: "repeat" as const,
        period,
        anchor: "2026-10-12",
      };
      const result = putBoardCard(s, p, "water", now, {
        day: "",
        time: "",
        configured: false,
      });
      expect(result.plan.slots?.[0]).toMatchObject({
        day: "1",
        time: "",
        configured: false,
      });
      expect(() => validateState(s)).not.toThrow();
      expect(planMessages(s, now)).toEqual({ notices: [], live: [] });
      const chosen = updatePlanSlot(
        s,
        result.plan.id,
        result.slotId!,
        "2",
        "10:00",
        now,
      );
      expect(chosen.slots?.[0]).toMatchObject({
        day: "2",
        time: "10:00",
        configured: true,
      });
      const cleared = updatePlanSlot(
        s,
        chosen.id,
        chosen.slots![0].id,
        "",
        "",
        now,
      );
      expect(cleared.slots?.[0]).toMatchObject({ day: "1", configured: false });
      expect(() =>
        updatePlanSlot(s, cleared.id, cleared.slots![0].id, "", "10:00", now),
      ).toThrow();
    });
  }
});
