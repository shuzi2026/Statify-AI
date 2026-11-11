import { ruleContext } from "./payments/access";
import { expect, it } from "vitest";
import { fresh, newCard, StateSchema, type State } from "./model";
import {
  bounds,
  newPlan,
  putBoardCard,
  saveBoardPlan,
  dailyPlanProgress,
} from "./planning";
import { execution, rollDays, start, settle } from "./engine";
const at = new Date(2026, 9, 26, 12).getTime();
function fixture() {
  const s = fresh(at, "cn");
  s.cards = [
    { ...newCard(at), id: "water", name: "喝水" },
    { ...newCard(at), id: "read", name: "阅读" },
  ];
  return s;
}
function finish(s: State, id = "water", now = at + 1) {
  const action = start(s, id, now);
  settle(
    s,
    action,
    { seconds: 0, quantity: 1, rating: 1, counted: true, note: "" },
    ruleContext(now),
  );
}

it("awards the current daily level immediately and keeps the same daily progress", () => {
  const s = fixture();
  putBoardCard(s, newPlan(at), "water", at);
  finish(s);
  expect(execution(s, at + 1)).toMatchObject({
    level: 1,
    byPeriod: { day: 1, week: 0, month: 0 },
  });
  expect(dailyPlanProgress(s, at + 1)).toMatchObject({
    value: 1,
    target: 1,
    done: true,
  });
  expect(s.planCycles[0].cards[0].target).toBe(1);
  expect(s.entries).toHaveLength(1);
});
it("a new today-only plan reverses only the current daily level and completing it restores that level", () => {
  const s = fixture();
  putBoardCard(s, newPlan(at), "water", at);
  finish(s);
  expect(execution(s, at + 1).level).toBe(1);
  putBoardCard(s, { ...newPlan(at + 2), scope: "once" }, "read", at + 2);
  expect(execution(s, at + 2).level).toBe(0);
  expect(dailyPlanProgress(s, at + 2)).toMatchObject({
    value: 0,
    target: 1,
    done: false,
  });
  finish(s, "read", at + 3);
  expect(execution(s, at + 3).level).toBe(1);
  expect(s.entries).toHaveLength(2);
  expect(dailyPlanProgress(s, at + 3)).toMatchObject({
    value: 1,
    target: 1,
    done: true,
  });
});
it("a today-only plan earns one daily level even without a repeating plan", () => {
  const s = fixture();
  putBoardCard(s, { ...newPlan(at), scope: "once" }, "water", at);
  finish(s);
  expect(execution(s, at + 1).level).toBe(1);
});
it("adding more work to the same current plan reverses and restores the level without double rewards", () => {
  const s = fixture(),
    { plan } = putBoardCard(s, newPlan(at), "water", at);
  finish(s);
  expect(execution(s, at + 1).level).toBe(1);
  putBoardCard(s, plan, "water", at + 2);
  expect(execution(s, at + 2).level).toBe(0);
  finish(s, "water", at + 3);
  expect(execution(s, at + 3).level).toBe(1);
  finish(s, "water", at + 4);
  expect(execution(s, at + 4).level).toBe(1);
});
it("tomorrow plans do not reduce today and empty days do not award levels", () => {
  const s = fixture();
  expect(execution(s, at).level).toBe(0);
  putBoardCard(s, newPlan(at), "water", at);
  finish(s);
  putBoardCard(
    s,
    { ...newPlan(at + 2), scope: "once", anchor: "2026-10-27" },
    "read",
    at + 2,
  );
  expect(execution(s, at + 2).level).toBe(1);
});
it("reload and midnight retain yesterday once while today must be completed separately", () => {
  const s = fixture();
  putBoardCard(s, newPlan(at), "water", at);
  finish(s);
  const loaded = StateSchema.parse(s);
  expect(execution(loaded, at + 2).level).toBe(1);
  const tomorrow = bounds("day", at).end;
  rollDays(loaded, tomorrow);
  expect(execution(loaded, tomorrow).level).toBe(1);
  expect(dailyPlanProgress(loaded, tomorrow)).toMatchObject({
    value: 0,
    target: 1,
    done: false,
  });
  finish(loaded, "water", tomorrow + 1);
  expect(execution(loaded, tomorrow + 1).level).toBe(2);
});
it("an unfinished new day cannot take back a previous day that was complete", () => {
  const s = fixture();
  putBoardCard(s, newPlan(at), "water", at);
  finish(s);
  const tomorrow = bounds("day", at).end;
  rollDays(s, tomorrow);
  putBoardCard(
    s,
    { ...newPlan(tomorrow + 1), scope: "once" },
    "read",
    tomorrow + 1,
  );
  expect(execution(s, tomorrow + 1).level).toBe(1);
});
it("score-mode daily plans also award as soon as the target is met", () => {
  const s = fixture(),
    { plan } = putBoardCard(s, newPlan(at), "water", at);
  saveBoardPlan(
    s,
    {
      ...plan,
      mode: "score",
      target: 2,
      cards: [{ id: "water", target: 2, score: 1 }],
    },
    at,
  );
  finish(s);
  expect(execution(s, at + 1).level).toBe(0);
  finish(s, "water", at + 2);
  expect(execution(s, at + 2).level).toBe(1);
});
it("invalidates the cached level when a just-added plan becomes active between clock ticks", () => {
  const s = fixture();
  putBoardCard(s, newPlan(at), "water", at);
  finish(s);
  putBoardCard(s, { ...newPlan(at + 2), scope: "once" }, "read", at + 2);
  Object.freeze(s.entries);
  expect(execution(s, at + 1).level).toBe(1);
  expect(execution(s, at + 2).level).toBe(0);
});
