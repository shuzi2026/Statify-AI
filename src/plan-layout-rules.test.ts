import { ruleContext } from "./payments/access";
import { it, expect } from "vitest";
import { fresh, newCard, StateSchema } from "./model";
import { execution, start, settle } from "./engine";
import {
  newPlan,
  putBoardCard,
  setPlanMode,
  updatePlanSlot,
  planMessages,
  planProgress,
  configureBoardCard,
} from "./planning";
const at = new Date(2026, 9, 14, 8).getTime();
it("card configuration validates atomically and changes one shared goal", () => {
  const s = fixture(),
    p = { ...newPlan(at), mode: "score" as const };
  for (const [target, score] of [
    [0, 2],
    [1, undefined],
    [1, 4],
    [1, 1.5],
  ] as [number, number | undefined][]) {
    const before = JSON.stringify(s);
    expect(() =>
      configureBoardCard(s, p, "water", target, score, at),
    ).toThrow();
    expect(JSON.stringify(s)).toBe(before);
  }
  const saved = configureBoardCard(s, p, "water", 3, 2, at);
  expect(saved.cards).toEqual([{ id: "water", target: 3, score: 2 }]);
  configureBoardCard(s, saved, "water", 2, 3, at);
  expect(s.plans[0].cards).toEqual([{ id: "water", target: 2, score: 3 }]);
  expect(StateSchema.parse(s).plans).toHaveLength(1);
});
it("editing a target removes excess latest arrangements and preserves completion records", () => {
  const s = fixture();
  let p: ReturnType<typeof newPlan> = { ...newPlan(at), timeline: true };
  for (const time of ["18:00", "14:00", "16:00"])
    p = putBoardCard(s, p, "water", at, { day: "1", time }).plan;
  const id = start(s, "water", at);
  settle(
    s,
    id,
    { seconds: 0, quantity: 1, rating: 1, counted: true, note: "" },
    ruleContext(at),
  );
  const entries = JSON.stringify(s.entries);
  configureBoardCard(s, p, "water", 2, undefined, at);
  expect(s.plans[0].slots?.map((v) => v.time).sort()).toEqual([
    "14:00",
    "16:00",
  ]);
  expect(JSON.stringify(s.entries)).toBe(entries);
});
function fixture() {
  const s = fresh(at, "cn");
  s.cards = [
    { ...newCard(at), id: "water", name: "水", method: "instant", score: 3 },
  ];
  return s;
}
it("pending placements are durable without inventing a time or reminder", () => {
  const s = fixture(),
    result = putBoardCard(s, { ...newPlan(at), timeline: true }, "water", at, {
      day: "1",
      time: "",
      configured: false,
    });
  const loaded = StateSchema.parse(s);
  expect(loaded.plans[0].slots?.[0]).toMatchObject({
    time: "",
    configured: false,
  });
  expect(planMessages(loaded, at + 3600000)).toEqual({ notices: [], live: [] });
  updatePlanSlot(loaded, result.plan.id, result.slotId!, "1", "09:14", at);
  expect(loaded.plans[0].slots?.[0]).toMatchObject({
    time: "09:14",
    configured: true,
  });
  expect(
    planMessages(loaded, new Date(2026, 9, 14, 9, 14).getTime()).live,
  ).toHaveLength(1);
});
it("settings mode survives validation and counts each real action only once", () => {
  const s = fixture();
  putBoardCard(s, newPlan(at), "water", at);
  for (const counted of [true, true, false]) {
    const id = start(s, "water", at);
    settle(
      s,
      id,
      { seconds: 0, quantity: 1, rating: 1, counted, note: "" },
      ruleContext(at),
    );
  }
  expect(execution(s, at).level).toBe(1);
  setPlanMode(s, "score", at);
  expect(execution(s, new Date(2026, 9, 14, 23).getTime()).level).toBe(1);
  expect(s.plans[0].mode).toBe("score");
  expect(planProgress(s, s.plans[0], at).value).toBe(1);
  expect(StateSchema.parse(s).planMode).toBe("score");
  s.cards = [];
  expect(execution(s, new Date(2026, 9, 14, 23).getTime()).level).toBe(1);
});
it("invalid or impossible settings do not partially mutate the save", () => {
  const s = fixture();
  putBoardCard(s, newPlan(at), "water", at);
  s.plans[0].cards[0].score = 0;
  const before = JSON.stringify(s);
  expect(() => setPlanMode(s, "score", at)).toThrow(/均为0/);
  expect(JSON.stringify(s)).toBe(before);
  expect(() => StateSchema.parse({ ...s, planMode: "invalid" })).toThrow();
  const legacy = structuredClone(s) as any;
  delete legacy.planMode;
  expect(StateSchema.parse(legacy).planMode).toBe("cards");
});
it("pending slots do not shift completion ordinals of configured reminders", () => {
  const s = fixture(),
    result = putBoardCard(s, { ...newPlan(at), timeline: true }, "water", at, {
      day: "1",
      time: "",
      configured: false,
    });
  putBoardCard(s, result.plan, "water", at, { day: "1", time: "09:14" });
  const id = start(s, "water", at);
  settle(
    s,
    id,
    { seconds: 0, quantity: 1, rating: 1, counted: true, note: "" },
    ruleContext(at),
  );
  expect(
    planMessages(s, new Date(2026, 9, 14, 9, 14).getTime()).live,
  ).toHaveLength(0);
});

it("clearing a date-only schedule retires its reminder identity even when the compatibility date matches", () => {
  const s = fixture(), result = putBoardCard(s, { ...newPlan(at), scope: "repeat", period: "week", timeline: true }, "water", at, { day: "1", time: "" });
  const cleared = updatePlanSlot(s, result.plan.id, result.slotId!, "", "", at);
  expect(cleared.slots![0]).toMatchObject({day:"1",time:"",configured:false});
  expect(cleared.slots![0].id).not.toBe(result.slotId);
  expect(planMessages(s, at)).toEqual({notices:[],live:[]});
});
