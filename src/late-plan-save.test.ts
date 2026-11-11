import "fake-indexeddb/auto";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { db, load, mutate, readState } from "./storage";
import { newCard } from "./model";
import { newPlan, savePlan } from "./planning";
import { withPlanApplyChoice, PlanApplyRequired } from "./late-plan-edits";
beforeEach(async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  for (const table of db.tables) await table.clear();
});
afterEach(() => vi.unstubAllGlobals());
it("rolls back the entire IndexedDB write before asking, then persists only the confirmed cycle policy", async () => {
  await load();
  const late = new Date();
  late.setHours(23, 0, 0, 0);
  const at = late.getTime(),
    early = at - 3600000;
  await mutate((s) => {
    const c = { ...newCard(early), id: "late-water", name: "喝水" };
    s.cards = [c];
    savePlan(
      s,
      { ...newPlan(early), id: "late-test", cards: [{ id: c.id, target: 2 }] },
      early,
      true,
    );
  });
  const before = JSON.stringify(await readState()),
    change = (s: any) =>
      savePlan(
        s,
        { ...s.plans[0], cards: [{ id: "late-water", target: 3 }] },
        at,
      );
  await expect(
    mutate((s) => withPlanApplyChoice(s, change, at)),
  ).rejects.toBeInstanceOf(PlanApplyRequired);
  expect(JSON.stringify(await readState())).toBe(before);
  await mutate((s) =>
    withPlanApplyChoice(s, change, at, { day: false, week: true, month: true }),
  );
  const saved = await readState();
  expect(saved.plans[0].cards[0].target).toBe(3);
  expect(
    saved.planCycles.find(
      (c) => c.planId === "late-test" && c.start <= at && at < c.end,
    )?.cards[0].target,
  ).toBe(2);
});
