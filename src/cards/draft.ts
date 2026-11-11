import { CardSchema, type Card, type State } from "../model";
import { cardDraftSlot } from "../local-data/registered-storage";
import { currentDraftEpoch } from "../local-data/draft-epoch";

type Draft = { card: Card; step: number; productUrl?: string };
// A denied auxiliary-storage operation must not revive a cancelled draft in
// this page. Retry cleanup when access returns; never clear the whole store.
const discarded = new Set<string>();

function clear(createdAt: number) {
  const entry = cardDraftSlot(createdAt);
  discarded.add(entry.identity);
  if (entry.remove() === "removed" || entry.write("null") === "saved")
    discarded.delete(entry.identity);
}

export function discardCardDraft(s: State, epoch = currentDraftEpoch()) {
  if (epoch !== currentDraftEpoch()) return;
  clear(s.createdAt);
}

export function readCardDraft(s: State): Draft | null {
  const entry = cardDraftSlot(s.createdAt),
    id = entry.identity;
  if (discarded.has(id)) {
    clear(s.createdAt);
    return null;
  }
  try {
    const raw = JSON.parse(entry.read().value || "null");
    if (
      !raw ||
      typeof raw.card?.name !== "string" ||
      raw.card.name.length > 80 ||
      !Number.isInteger(raw.step) ||
      raw.step < 1 ||
      raw.step > 4
    )
      return null;
    const parsed = CardSchema.safeParse({
      ...raw.card,
      name: raw.card.name.trim() || "未命名",
    });
    if (!parsed.success) return null;
    // An earlier cleanup may have failed after the real card was committed.
    // Reopening "New card" must never edit that committed card by its old ID.
    if (s.cards.some((card) => card.id === parsed.data.id)) {
      clear(s.createdAt);
      return null;
    }
    return { card: { ...parsed.data, name: raw.card.name }, step: raw.step,
      productUrl: typeof raw.productUrl === "string" ? raw.productUrl.slice(0, 2048) : undefined };
  } catch {
    return null;
  }
}

export function writeCardDraft(s: State, draft: Draft, epoch = currentDraftEpoch()) {
  if (epoch !== currentDraftEpoch()) return;
  try {
    const entry = cardDraftSlot(s.createdAt);
    if (entry.write(JSON.stringify(draft)) === "saved")
      discarded.delete(entry.identity);
  } catch {
    // The form owns its live input; an optional draft write cannot submit it.
  }
}
