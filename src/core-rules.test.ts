import { ruleContext, acceptEntitlement } from "./payments/access";
import { afterEach, expect, it, vi } from "vitest";
import { fresh, newCard, PlanSchema } from "./model";
import { start, freeze, settle, attrAllowed, saveCard } from "./engine";
import { newPlan, planDate, saveBoardPlan } from "./planning";
import { validPlanUses, validPlanScore } from "../shared/rules/plans";
import { slotLabel } from "./plan-labels";

afterEach(() => {
  vi.restoreAllMocks();
  acceptEntitlement(null);
});
const at = new Date(2026, 9, 20, 12).getTime();
it("settlement uses its supplied time without reading the wall clock", () => {
  const s = fresh(at, "cn");
  s.cards = [
    {
      ...newCard(at),
      id: "read",
      name: "读书",
      method: "timed",
      rewards: [{ id: "attr-know", amount: 10 }],
    },
  ];
  const id = start(s, "read", at);
  freeze(s, id, at + 60000);
  vi.spyOn(Date, "now").mockImplementation(() => {
    throw Error("Unexpected ambient clock");
  });
  const entry = settle(
    s,
    id,
    { seconds: 60, quantity: 1, rating: 1, counted: true, note: "" },
    ruleContext(at + 60000),
  );
  expect(entry.measured).toBe(60);
  expect(entry.rewards[0].actual).toBe(10);
});
it.each([
  { member: false, trial: false, allowed: [true, false, false] },
  { member: false, trial: true, allowed: [true, false, true] },
  { member: true, trial: false, allowed: [true, true, true] },
])(
  "keeps free/trial/paid slot rules with explicit inputs: %j",
  ({ member, trial, allowed }) => {
    const s = fresh(at, "cn"),
      original = s.attributes[0];
    const attrs = [
      original,
      { ...original, original: false },
      { ...original, original: false, slot: 4 },
    ];
    const context = { now: at, member, trial };
    expect(attrs.map((a) => attrAllowed(s, a, context))).toEqual(allowed);
    expect(attrAllowed(s, { ...original, slot: -1 }, context)).toBe(false);
  },
);
it("authorization snapshots stay stable while callers can capture expiration or revocation", () => {
  acceptEntitlement({
    member: true,
    member_ends_at: at + 500,
    trial_ends_at: at + 800,
    trial_available: false,
    initial_adjustment_until: null,
    initial_adjustment: null,
    valid_until: at + 1000,
  });
  expect(ruleContext(at + 499)).toEqual({
    now: at + 499,
    member: true,
    trial: true,
  });
  expect(ruleContext(at + 500)).toEqual({
    now: at + 500,
    member: false,
    trial: true,
  });
  expect(ruleContext(at + 800)).toEqual({
    now: at + 800,
    member: false,
    trial: false,
  });
  const context = ruleContext(at),
    s = fresh(at, "cn"),
    card = {
      ...newCard(at),
      name: "合成图片",
      customArt: "data:image/png;base64,aGVsbG8=",
    };
  acceptEntitlement(null);
  const before = structuredClone(s);
  expect(() => saveCard(s, card, ruleContext(at))).toThrow(
    "上传卡牌图片为会员功能",
  );
  expect(s).toEqual(before);
  saveCard(s, card, context);
  expect(s.cards[0].customArt).toBe(card.customArt);
});
it("plan input and schema retain independently specified inclusive limits", () => {
  for (const n of [1, 10000]) expect(validPlanUses(n)).toBe(true);
  for (const n of [0, 10001, 1.5, NaN, Infinity, "1"])
    expect(validPlanUses(n)).toBe(false);
  for (const n of [0, 1, 3]) expect(validPlanScore(n)).toBe(true);
  for (const n of [-1, 4, 0.5, NaN, "0"]) expect(validPlanScore(n)).toBe(false);
  const p = {
    ...newPlan(at),
    target: 30000000,
    cards: [{ id: "card", target: 10000, score: 3 }],
  };
  expect(PlanSchema.safeParse(p).success).toBe(true);
  expect(PlanSchema.safeParse({ ...p, target: 30000001 }).success).toBe(false);
  expect(
    PlanSchema.safeParse({
      ...p,
      cards: [{ id: "card", target: 10001, score: 3 }],
    }).success,
  ).toBe(false);
  expect(
    PlanSchema.safeParse({ ...p, cards: [{ id: "card", target: 1, score: 4 }] })
      .success,
  ).toBe(false);
  expect(
    PlanSchema.safeParse({
      ...p,
      cards: Array.from({ length: 1000 }, () => p.cards[0]),
    }).success,
  ).toBe(true);
  expect(
    PlanSchema.safeParse({
      ...p,
      cards: Array.from({ length: 1001 }, () => p.cards[0]),
    }).success,
  ).toBe(false);
});
it("region and label locale are explicit, with independent fresh defaults", () => {
  const cn = fresh(at, "cn"),
    global = fresh(at, "global");
  expect(cn.region).toBe("cn");
  expect(global.region).toBe("global");
  cn.preferences.rewardPerUnitMax = 10;
  expect(global.preferences).not.toEqual(cn.preferences);
  const p = { ...newPlan(at), period: "week" as const },
    slot = { id: "slot", cardId: "card", day: "1", time: "13:00", minutes: 0 };
  expect(slotLabel(p, slot, undefined)).toBe("周一 13:00");
  expect(slotLabel(p, slot, "en")).toBe("Mon 13:00");
});
it("one-off slot validation uses the supplied calendar instant", () => {
  const s = fresh(at, "cn");
  s.cards = [{ ...newCard(at), id: "read", name: "读书" }];
  const plan = {
    ...newPlan(at),
    scope: "once" as const,
    cards: [{ id: "read", target: 1 }],
    slots: [
      {
        id: "slot",
        cardId: "read",
        day: planDate(at),
        time: "13:00",
        minutes: 0,
      },
    ],
  };
  vi.spyOn(Date, "now").mockImplementation(() => {
    throw Error("Unexpected ambient clock");
  });
  expect(saveBoardPlan(s, plan, at).cards).toEqual([
    { id: "read", target: 1, score: 1 },
  ]);
});
