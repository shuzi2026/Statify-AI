import { expect, test } from "vitest";
import { attributeRules } from "../../shared/rules/growth";
import { adjustInitialLevels } from "../attributes/initial-levels";
import { correctStatus } from "../engine";
import { fresh, newCard } from "../model";
import { prepareAiExistingOperation, resolveAiCategory } from "./ai-local-operation";

const now = 1_800_000_000_000;

test("resolves the saved category and refuses to guess between matching cards", () => {
  const state = fresh(now, "global");
  state.categories = ["Exercise"];
  expect(resolveAiCategory("运动", state)).toBe("Exercise");
  state.cards = ["Morning walk", "Evening walk"].map((name) => ({ ...newCard(now), name }));
  const edit = { type: "edit_card", cardName: "walk", category: "运动", name: null,
    method: null, minutes: null, unit: null, message: null } as const;
  expect(() => prepareAiExistingOperation(edit, state, now)).toThrow();
  expect(prepareAiExistingOperation({ ...edit, cardName: "Evening walk" }, state, now)).toMatchObject({
    kind: "card", id: state.cards[1].id, suggested: { changes: { category: "Exercise" } },
  });
});

test("changing one status keeps another status's correction intact", () => {
  const state = fresh(now, "global");
  correctStatus(state, { stress: 42 }, now);
  const previousStress = { ...state.states.stress };
  const modal = prepareAiExistingOperation({ type: "adjust_status",
    changes: [{ id: "vitality", mode: "add", value: 5 }] }, state, now + 1_000);
  expect(modal).toEqual({ kind: "status", suggested: { vitality: 55 } });
  if (modal.kind !== "status" || !modal.suggested) throw Error("Expected a status proposal");
  correctStatus(state, modal.suggested, now + 1_000);
  expect(state.states.stress).toEqual(previousStress);
});

test("checks the initial level window both before opening and when saving", () => {
  const state = fresh(now, "global");
  state.attributes[0].earned = 100;
  const operation = { type: "adjust_initial_levels",
    changes: [{ attribute: "attr-body", value: 60 }] } as const;
  const request = { ...operation, changes: [...operation.changes] };
  const modal = prepareAiExistingOperation(request, state, now);
  expect(modal).toEqual({ kind: "initial", suggested: { "attr-body": 60 } });
  if (modal.kind !== "initial" || !modal.suggested) throw Error("Expected an initial level proposal");
  const expired = now + attributeRules.initialAdjustmentWindowMs + 1;
  expect(() => adjustInitialLevels(state, modal.suggested!, expired)).toThrow();
  expect(state.initialEdited).toBe(false);
  adjustInitialLevels(state, modal.suggested, now);
  expect(state.attributes[0]).toMatchObject({ initial: 60, earned: 100 });
  expect(() => prepareAiExistingOperation(request, state, now)).toThrow();
});
