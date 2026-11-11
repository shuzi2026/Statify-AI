import { ruleContext } from "./payments/access";
import { afterEach, expect, it, vi } from "vitest";
import curve from "../tests/fixtures/growth-baseline.json";
import { threshold, cumulative } from "./engine";
import { localDateKey } from "../shared/calendar";
import { planReward, planRules } from "../shared/rules/plans";
import { attributeRules } from "../shared/rules/growth";
import { CardSchema, PlanSchema, fresh, newCard } from "./model";
const at = new Date(2026, 10, 4, 12).getTime();
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
it("preserves all 101 growth thresholds and cumulative totals from the source snapshot", () => {
  for (const row of curve) {
    expect(threshold(row.level)).toBe(row.threshold);
    expect(cumulative(row.level)).toBe(row.cumulative);
  }
});
it("keeps schema validation tied to shared limits without tightening historical names", () => {
  const card = {
    ...newCard(at),
    name: "旧".repeat(200),
    score: planRules.maxScore,
  };
  expect(CardSchema.safeParse(card).success).toBe(true);
  expect(
    CardSchema.safeParse({ ...card, score: planRules.maxScore + 1 }).success,
  ).toBe(false);
  expect(attributeRules.totalSlots).toBe(6);
});
for (const region of ["cn", "global"])
  for (const mode of ["cards", "score"] as const)
    it.each(["day", "week", "month"] as const)(
      `${region} ${mode} %s preserves priority, immediate reward and saved historical settlement`,
      async (period) => {
        vi.stubEnv("VITE_STATIFY_REGION", region);
        vi.resetModules();
        const model = await import("./model"),
          engine = await import("./engine"),
          plans = await import("./planning"),
          format = await import("./storage-format"),
          migration = await import("./migrate");
        const s = model.fresh(at, region as "cn" | "global");
        s.cards = [
          { ...model.newCard(at), id: "repeat-card", name: "重复" },
          { ...model.newCard(at), id: "once-card", name: "指定" },
        ];
        const repeat = plans.saveBoardPlan(
          s,
          {
            ...plans.newPlan(at),
            period,
            mode,
            target: 1,
            cards: [{ id: "repeat-card", target: 1, score: 1 }],
          },
          at,
        );
        const finish = (card: string, time: number) => {
          const id = engine.start(s, card, time);
          return engine.settle(
            s,
            id,
            { seconds: 0, quantity: 1, rating: 1, counted: true, note: "历史" },
            ruleContext(time),
          );
        };
        finish("repeat-card", at + 1);
        expect(engine.execution(s, at + 1).level).toBe(planReward[period]);
        plans.saveBoardPlan(
          s,
          {
            ...plans.newPlan(at),
            scope: "once",
            period,
            mode,
            target: 1,
            cards: [{ id: "once-card", target: 1, score: 1 }],
          },
          at + 2,
        );
        expect(plans.executionPlan(s, period, at + 2)?.progress.value).toBe(0);
        expect(engine.execution(s, at + 2).level).toBe(0);
        const record = finish("once-card", at + 3);
        expect(engine.execution(s, at + 3).level).toBe(planReward[period]);
        const history = JSON.stringify(s.entries),
          snapshots = structuredClone(s.planCycles),
          next = plans.bounds(period, at).end;
        const loaded = migration.validateState(
          format.unpackState(format.packState(s)),
        );
        engine.rollDays(loaded, next);
        expect(engine.execution(loaded, next).level).toBe(planReward[period]);
        expect(plans.executionPlan(loaded, period, next)?.scope).toBe("repeat");
        plans.saveBoardPlan(
          loaded,
          {
            ...loaded.plans.find((p) => p.id === repeat.id)!,
            cards: [{ id: "repeat-card", target: 3, score: 1 }],
            target: 3,
          },
          next + 1,
        );
        expect(JSON.stringify(loaded.entries)).toBe(history);
        expect(loaded.planCycles.filter((c) => c.end <= next)).toEqual(
          snapshots,
        );
        expect(engine.execution(loaded, next + 1).level).toBe(
          planReward[period],
        );
        const retried = engine.settle(
          loaded,
          record.id,
          {
            seconds: 999,
            quantity: 999,
            rating: 1,
            counted: true,
            note: "重试",
          },
          ruleContext(next + 2),
        );
        expect(retried).toEqual(record);
        expect(JSON.stringify(loaded.entries)).toBe(history);
      },
    );
it("keeps legacy entry-score and modern plan-item-score interpretations separate", async () => {
  const { start, settle, execution, rollDays } = await import("./engine");
  const { newPlan, saveBoardPlan, planProgress, bounds } =
    await import("./planning");
  const s = fresh(at, "cn");
  s.cards = [{ ...newCard(at), id: "card", name: "行动", score: 3 }];
  s.plans = [
    {
      id: "legacy",
      name: "旧",
      period: "day",
      mode: "score",
      target: 3,
      cards: [],
      active: true,
      createdAt: at,
    },
  ];
  s.dailyPlan = "legacy";
  const finish = (time: number) => {
    const id = start(s, "card", time);
    settle(
      s,
      id,
      { seconds: 0, quantity: 1, rating: 1, counted: true, note: "" },
      ruleContext(time),
    );
  };
  finish(at + 1);
  expect(execution(s, at + 1).level).toBe(1);
  const next = bounds("day", at).end;
  s.plans[0].active = false;
  rollDays(s, next);
  const p = saveBoardPlan(
    s,
    {
      ...newPlan(next),
      mode: "score",
      target: 2,
      cards: [{ id: "card", target: 2, score: 1 }],
    },
    next,
  );
  finish(next + 1);
  expect(s.entries.at(-1)!.score).toBe(3);
  expect(planProgress(s, p, next + 1).value).toBe(1);
  expect(execution(s, next + 1).level).toBe(1);
  finish(next + 2);
  expect(execution(s, next + 2).level).toBe(2);
});
it("attributes late settlement to the original period and start snapshots after storage round-trip", async () => {
  const { start, freeze, settle, execution, rollDays } =
    await import("./engine");
  const { newPlan, saveBoardPlan } = await import("./planning");
  const { packState, unpackState } = await import("./storage-format");
  const { validateState } = await import("./migrate");
  const beforeMidnight = new Date(2026, 10, 4, 23, 58).getTime(),
    later = new Date(2026, 10, 6, 12).getTime();
  const s = fresh(at, "cn");
  s.cards = [
    {
      ...newCard(at),
      id: "timed",
      name: "原名称",
      method: "timed",
      rewards: [{ id: s.attributes[0].id, amount: 10 }],
    },
  ];
  saveBoardPlan(
    s,
    { ...newPlan(at), cards: [{ id: "timed", target: 1, score: 1 }] },
    at,
  );
  const id = start(s, "timed", beforeMidnight);
  freeze(s, id, beforeMidnight + 60000);
  s.cards[0].name = "新名称";
  s.cards[0].rewards[0].amount = 900;
  rollDays(s, later);
  const restored = validateState(unpackState(packState(s)));
  const entry = settle(
    restored,
    id,
    { seconds: 60, quantity: 1, rating: 1, counted: true, note: "" },
    ruleContext(later),
  );
  expect(entry.name).toBe("原名称");
  expect(entry.date).toBe(localDateKey(beforeMidnight));
  expect(entry.rewards[0].actual).toBe(10);
  expect(execution(restored, later).level).toBe(1);
});
it("rejects plan targets above the shared cap at the schema boundary", async () => {
  const { newPlan } = await import("./planning");
  const p = { ...newPlan(at), cards: [{ id: "a", target: planRules.maxUses }] };
  expect(PlanSchema.safeParse(p).success).toBe(true);
  p.cards[0].target++;
  expect(PlanSchema.safeParse(p).success).toBe(false);
});
