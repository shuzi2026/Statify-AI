import { expect, it } from "vitest";
import type { AiActivityOperation } from "../../shared/ai-chat";
import { correctStatus } from "../engine";
import { applyCommand } from "../application/commands";
import { fresh, newCard } from "../model";
import { saveJournalNote } from "../journal/note";
import { readActivity } from "./ai-activity";

const query: Extract<AiActivityOperation, { type: "read_activity" }> = {
  type: "read_activity", view: "journal", period: "all", from: null, to: null,
  cardName: null, attribute: null, status: null, keyword: null,
};

it("queries stored XP, status corrections, renamed and removed cards and exact journal notes", () => {
  const now = new Date(2026, 10, 10, 12).getTime();
  const s = fresh(now - 86_400_000, "global");
  const card = {
    ...newCard(now), name: "Walk", settle: false,
    rewards: [{ id: "attr-body", amount: 5 }],
    effects: [{ id: "mood", amount: 2 }],
  };
  s.cards.push(card);
  const context = { now, member: false, trial: false };
  const outcome = applyCommand(s, { type: "start", cardId: card.id }, context);
  if (outcome.kind !== "completed") throw Error("Expected an instant check-in");
  saveJournalNote(s, outcome.entry.id, "Quiet streets\nFelt better");
  expect(() => saveJournalNote(s, outcome.entry.id, "overwrite", "stale")).toThrow();
  correctStatus(s, { mood: 75 }, now + 1000);
  s.changes[0].kind = "State correction";
  card.name = "Morning loop";

  const read = (change: Partial<typeof query>) => readActivity(s, { ...query, ...change }, now + 2000, false);
  expect(read({ view: "check_ins", cardName: "Morning loop" }).page(0, 10)).toEqual([expect.stringContaining("Walk")]);
  expect(read({ view: "attribute", attribute: "Physique" }).page(0, 10)).toEqual([expect.stringMatching(/Walk.*Physique \+5 XP/)]);
  expect(read({ view: "status", status: "mood" }).page(0, 10)).toEqual([
    expect.stringMatching(/Manual adjustment.*→ 75/), expect.stringMatching(/Walk.*Mood/),
  ]);
  expect(read({ period: "yesterday" }).count).toBe(0);
  expect(read({ from: "2026-11-10", to: "2026-11-10" }).count).toBe(1);
  s.cards = [];
  const journal = read({ cardName: "Walk", keyword: "quiet streets" });
  expect(journal.page(0, 1)).toEqual([expect.stringContaining("Quiet streets\nFelt better")]);
  expect(journal.page(1, 1)).toEqual([]);
});
