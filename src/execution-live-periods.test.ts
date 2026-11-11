import { ruleContext } from "./payments/access";
import { expect, it } from "vitest";
import { fresh, newCard, StateSchema, type Plan, type State } from "./model";
import {
  bounds,
  newPlan,
  saveBoardPlan,
  planProgress,
  dailyPlanProgress,
  todayPlanTodo,
  planMessages,
  planReward,
  executionPlan,
  planDate,
} from "./planning";
import { execution, rollDays, start, settle } from "./engine";
const at = new Date(2026, 10, 4, 12).getTime();
function fixture() {
  const s = fresh(at, "cn");
  s.planMode = "score";
  s.cards = ["water", "read"].map((id) => ({ ...newCard(at), id, name: id }));
  return s;
}
function add(
  s: State,
  period: Plan["period"],
  scope: Plan["scope"] = "repeat",
  card = "water",
  now = at,
) {
  return saveBoardPlan(
    s,
    {
      ...newPlan(now),
      period,
      scope,
      mode: "score",
      target: 2,
      cards: [{ id: card, target: 2, score: 2 }],
    },
    now,
  );
}
function finish(s: State, card = "water", now = at + 1) {
  const id = start(s, card, now);
  settle(
    s,
    id,
    { seconds: 0, quantity: 1, rating: 1, counted: true, note: "" },
    ruleContext(now),
  );
}
it("keeps a daily slot visible even without an active timeline alert", () => {
  const s = fixture();
  const p = add(s, "day");
  const slot = {
    id: "morning",
    cardId: "water",
    day: "1",
    time: "09:00",
    minutes: 0,
  };
  const morning = new Date(2026, 10, 4, 9).getTime();
  for (const timeline of [true, false]) {
    saveBoardPlan(s, { ...p, timeline, slots: [slot] }, at);
    const todo = todayPlanTodo(s, at, dailyPlanProgress(s, at));
    expect(todo.tasks).toMatchObject([{ times: [morning], nextTime: morning }]);
    expect(todo.messageIds.size).toBe(0);
    expect(planMessages(s, at)).toEqual({ notices: [], live: [] });
  }
});
it("uses the next weekly slot after counting earlier dates in the same cycle", () => {
  const s = fixture();
  const yesterday = new Date(2026, 10, 3, 12).getTime();
  const p = add(s, "week", "repeat", "water", yesterday);
  saveBoardPlan(
    s,
    {
      ...p,
      cards: [{ id: "water", target: 3, score: 2 }],
      timeline: true,
      slots: [
        ["2", "13:00"],
        ["3", "09:00"],
        ["3", "15:30"],
      ].map(([day, time], index) => ({
        id: String(index),
        cardId: "water",
        day,
        time,
        minutes: 0,
      })),
    },
    yesterday,
  );
  const early = new Date(2026, 10, 4, 9).getTime();
  const late = new Date(2026, 10, 4, 15, 30).getTime();
  finish(s, "water", yesterday + 3600000);
  expect(todayPlanTodo(s, at, dailyPlanProgress(s, at)).tasks).toMatchObject([
    { value: 1, times: [early, late], nextTime: early },
  ]);
  finish(s, "water", at);
  expect(todayPlanTodo(s, at, dailyPlanProgress(s, at)).tasks).toMatchObject([
    { value: 2, times: [early, late], nextTime: late },
  ]);
});
for (const scope of ["repeat", "once"] as const)
  it.each(["day", "week", "month"] as const)(
    `${scope} %s awards on reaching score target without completing every planned use`,
    (period) => {
      const s = fixture(),
        p = add(s, period, scope);
      expect(execution(s, at).level).toBe(0);
      finish(s);
      expect(planProgress(s, p, at + 1)).toMatchObject({
        value: 2,
        target: 2,
        done: true,
        counts: [{ value: 1, target: 2 }],
      });
      expect(execution(s, at + 1).byPeriod[period]).toBe(planReward[period]);
      finish(s, "water", at + 2);
      expect(execution(s, at + 2).level).toBe(planReward[period]);
      const loaded = StateSchema.parse(s);
      rollDays(loaded, bounds(period, at).end + 1);
      expect(execution(loaded, bounds(period, at).end + 1).level).toBe(
        planReward[period],
      );
    },
  );
it.each(["day", "week", "month"] as const)(
  "%s updates the current reward when its score target changes, without duplicate rewards",
  (period) => {
    const s = fixture(),
      p = add(s, period);
    finish(s);
    expect(execution(s, at + 1).level).toBe(planReward[period]);
    saveBoardPlan(s, { ...p, target: 4 }, at + 2);
    expect(execution(s, at + 2).level).toBe(0);
    finish(s, "water", at + 3);
    expect(execution(s, at + 3).level).toBe(planReward[period]);
  },
);
it("uses only today-specific 0/1 instead of adding it to the repeating 2/2 score plan", () => {
  const s = fixture(),
    p = add(s, "day");
  saveBoardPlan(
    s,
    {
      ...newPlan(at),
      scope: "once",
      mode: "score",
      target: 1,
      cards: [{ id: "read", target: 1, score: 1 }],
    },
    at,
  );
  finish(s);
  expect(planProgress(s, p, at + 1)).toMatchObject({
    value: 2,
    target: 2,
    done: true,
  });
  expect(dailyPlanProgress(s, at + 1)).toMatchObject({
    value: 0,
    target: 1,
    done: false,
  });
  expect(execution(s, at + 1).level).toBe(0);
  finish(s, "read", at + 2);
  expect(dailyPlanProgress(s, at + 2)).toMatchObject({
    value: 1,
    target: 1,
    done: true,
  });
  expect(execution(s, at + 2).level).toBe(1);
});
for (const mode of ["score", "cards"] as const)
  it.each(["day", "week", "month"] as const)(
    `${mode} %s uses the specified target exclusively and falls back to repeat next period`,
    (period) => {
      const s = fixture(),
        repeat = add(s, period);
      saveBoardPlan(s, { ...repeat, mode }, at);
      finish(s);
      finish(s, "water", at + 2);
      expect(execution(s, at + 2).level).toBe(planReward[period]);
      const once = saveBoardPlan(
        s,
        {
          ...newPlan(at + 3),
          scope: "once",
          period,
          mode,
          target: 1,
          cards: [{ id: "read", target: 1, score: 1 }],
        },
        at + 3,
      );
      expect(executionPlan(s, period, at + 3)).toMatchObject({
        scope: "once",
        progress: { value: 0, target: 1, done: false },
      });
      expect(execution(s, at + 3).level).toBe(0);
      finish(s, "read", at + 4);
      expect(executionPlan(s, period, at + 4)).toMatchObject({
        progress: { value: 1, target: 1, done: true },
      });
      expect(execution(s, at + 4).level).toBe(planReward[period]);
      saveBoardPlan(
        s,
        {
          ...repeat,
          mode,
          target: 4,
          cards: [{ id: "water", target: 4, score: 1 }],
        },
        at + 5,
      );
      expect(
        planProgress(
          s,
          s.plans.find((p) => p.id === repeat.id)!,
          at + 5,
        ).done,
      ).toBe(false);
      expect(execution(s, at + 5).level).toBe(planReward[period]);
      const loaded = StateSchema.parse(s),
        next = bounds(period, at).end;
      rollDays(loaded, next);
      expect(executionPlan(loaded, period, next)).toMatchObject({
        scope: "repeat",
        progress: { value: 0, target: 4, done: false },
      });
      expect(execution(loaded, next).level).toBe(planReward[period]);
      expect(loaded.plans.find((p) => p.id === once.id)).toBeDefined();
      expect(loaded.plans.find((p) => p.id === repeat.id)).toBeDefined();
    },
  );
it.each(["day", "week", "month"] as const)(
  "%s ignores future and empty specified plans and restores repeat when the specified plan is emptied",
  (period) => {
    const s = fixture();
    add(s, period);
    finish(s);
    const next = bounds(period, at).end;
    saveBoardPlan(
      s,
      {
        ...newPlan(at),
        period,
        scope: "once",
        anchor: planDate(next),
        mode: "score",
        target: 1,
        cards: [{ id: "read", target: 1, score: 1 }],
      },
      at,
    );
    const empty = saveBoardPlan(
      s,
      { ...newPlan(at), period, scope: "once" },
      at,
    );
    expect(executionPlan(s, period, at + 1)?.scope).toBe("repeat");
    expect(execution(s, at + 1).level).toBe(planReward[period]);
    const once = saveBoardPlan(
      s,
      { ...empty, mode: "score", cards: [{ id: "read", target: 1, score: 1 }] },
      at + 2,
    );
    expect(execution(s, at + 2).level).toBe(0);
    saveBoardPlan(s, { ...once, cards: [] }, at + 3);
    expect(executionPlan(s, period, at + 3)?.scope).toBe("repeat");
    expect(execution(s, at + 3).level).toBe(planReward[period]);
  },
);
it("today-specific plan also overrides an imported legacy daily snapshot", () => {
  const s = fixture();
  s.days = [
    {
      date: planDate(at),
      target: 7,
      mode: "score",
      requirements: [],
      planId: "legacy",
      enabled: true,
    },
  ];
  add(s, "day", "once");
  finish(s);
  expect(dailyPlanProgress(s, at + 1)).toMatchObject({
    value: 2,
    target: 2,
    done: true,
  });
  expect(execution(s, at + 1).level).toBe(1);
});
