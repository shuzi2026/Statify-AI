import { expect, it } from "vitest";
import { fresh, newCard } from "../model";
import { packState } from "../storage-format";
import { cloudContent } from "./content";

const encode = (data: ReturnType<typeof packState>) =>
  JSON.stringify({ format: "statify-backup", formatVersion: 2, data });
function fixture() {
  const state = fresh(1000, "global");
  state.cards = [
    { ...newCard(1000), id: "z", name: "First", method: "timed" as const },
    { ...newCard(1000), id: "a", name: "Second" },
  ];
  return state;
}
it("ignores physical row order, regenerated version IDs and derived indexes", () => {
  const state = fixture(),
    first = packState(state),
    second = packState(structuredClone(state));
  expect(first.versions[0].id).not.toBe(second.versions[0].id);
  for (const rows of Object.values(second.rows)) rows.reverse();
  second.versions.reverse();
  second.rows.cards[0].date = "synthetic-index-only";
  expect(cloudContent(encode(second))).toBe(cloudContent(encode(first)));
});
it("keeps actual business order, historical definitions and timer state significant", () => {
  const state = fixture();
  state.actions = [
    {
      id: "timer",
      card: { ...state.cards[0], name: "Historical card name" },
      startedAt: 1000,
      elapsed: 0,
      runningSince: 1000,
      endedAt: null,
      status: {},
      coefficient: 1,
      plans: [],
    },
  ];
  const expected = cloudContent(encode(packState(state)));
  for (const change of [
    (s: typeof state) => s.cards.reverse(),
    (s: typeof state) => {
      s.actions[0].card.name = "Changed historical name";
    },
    (s: typeof state) => {
      s.actions[0].elapsed = 20;
    },
    (s: typeof state) => {
      s.cards.pop();
    },
  ]) {
    const next = structuredClone(state);
    change(next);
    expect(cloudContent(encode(packState(next)))).not.toBe(expected);
  }
});
