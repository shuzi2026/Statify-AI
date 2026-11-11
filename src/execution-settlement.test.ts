import { ruleContext } from "./payments/access";
import { formerCutoff } from "../tests/helpers/former-cutoff";
import { it, expect } from "vitest";
import { fresh, newCard, StateSchema } from "./model";
import { newPlan, putBoardCard, setPlanMode, bounds } from "./planning";
import { start, settle, execution, rollDays } from "./engine";
const at = new Date(2026, 9, 14, 8).getTime();
function fixture() {
  const s = fresh(at, "cn");
  s.cards = [{ ...newCard(at), id: "water", name: "喝水", method: "instant" }];
  return s;
}
function complete(s: ReturnType<typeof fixture>, now: number) {
  const id = start(s, "water", now);
  settle(
    s,
    id,
    { seconds: 0, quantity: 1, rating: 1, counted: true, note: "" },
    ruleContext(now),
  );
}
it.each(["day", "week", "month"] as const)(
  "%s awards immediately and keeps its own reward once after reload",
  (period) => {
    const s = fixture();
    putBoardCard(
      s,
      { ...newPlan(at), period, anchor: "2026-10-14" },
      "water",
      at,
    );
    complete(s, at + 1000);
    const end = formerCutoff(period, at),
      reward = { day: 1, week: 3, month: 5 }[period];
    expect(execution(s, at).level).toBe(0);
    expect(execution(s, at + 1000).level).toBe(reward);
    expect(execution(s, end - 1).level).toBe(reward);
    expect(execution(s, end).level).toBe(reward);
    expect(execution(s, end).byPeriod[period]).toBe(reward);
    const loaded = StateSchema.parse(s);
    rollDays(loaded, bounds(period, at).end + 1000);
    expect(execution(loaded, bounds(period, at).end + 1000).level).toBe(reward);
    expect(execution(loaded, bounds(period, at).end + 1000).level).toBe(reward);
  },
);
it("daily, weekly and monthly rewards accumulate independently without per-action grades", () => {
  const s = fixture();
  for (const period of ["day", "week", "month"] as const)
    putBoardCard(s, { ...newPlan(at), period }, "water", at);
  complete(s, at + 1);
  complete(s, at + 2);
  expect(execution(s, at + 2)).toMatchObject({
    level: 9,
    byPeriod: { day: 1, week: 3, month: 5 },
  });
  expect(execution(s, formerCutoff("day", at)).level).toBe(9);
  expect(execution(s, formerCutoff("week", at)).level).toBe(9);
  expect(execution(s, formerCutoff("month", at))).toMatchObject({
    level: 9,
    byPeriod: { day: 1, week: 3, month: 5 },
  });
});
it("date-specific daily plans count toward the daily reward; score mode uses plan target", () => {
  const s = fixture();
  putBoardCard(s, { ...newPlan(at), scope: "once" }, "water", at);
  complete(s, at + 1);
  expect(execution(s, at + 1).level).toBe(1);
  const t = fixture();
  putBoardCard(t, newPlan(at), "water", at);
  setPlanMode(t, "score", at);
  t.plans[0].cards[0].score = 2;
  t.planCycles[0].cards[0].score = 2;
  complete(t, at + 1);
  expect(execution(t, at + 2).level).toBe(1);
  expect(execution(t, formerCutoff("day", at)).level).toBe(1);
});
it("a completion after 23:00 is awarded after completion, never ahead of its finish time", () => {
  const s = fixture();
  putBoardCard(s, newPlan(at), "water", at);
  const end = formerCutoff("day", at);
  complete(s, end + 60000);
  expect(execution(s, end).level).toBe(0);
  expect(execution(s, end + 60000).level).toBe(1);
});
