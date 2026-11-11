import type { ShoppingCardProduct, ShoppingReceipt } from "../../shared/shopping-demo";
import type { Card, State } from "../model";
import { saveCard } from "../engine";
import { Unchanged } from "../application/commands";
import type { RuleContext } from "../rules/context";
import { purchasedShoppingCard } from "./shopping-card";
import { prepareShoppingArtwork } from "./shopping-card-image";

/** Network/image work stays outside the save transaction. Repurchases never replace card artwork. */
export async function preparePurchasedReceipt(state: State, receipt: ShoppingReceipt, cardId?: string,
  prepare = prepareShoppingArtwork): Promise<ShoppingReceipt> {
  if (!receipt.product || state.entries.some((entry) => entry.id === `paypal-${receipt.orderId}`) ||
    purchasedShoppingCard(state, receipt.product, cardId) || receipt.product.generatedArt?.transparent) return receipt;
  const product = await prepare(receipt.product, receipt.product.kind ?? receipt.product.title).catch(() => receipt.product!);
  return { ...receipt, product: { ...receipt.product, generatedArt: product.generatedArt } };
}

/** Repair only the generated icon; don't undo edits made while downloading it. */
export function saveRepairedShoppingArtwork(state: State, original: Card, art: ShoppingCardProduct["generatedArt"], context: RuleContext) {
  const current = state.cards.find((card) => card.id === original.id);
  if (!art?.transparent || !current?.shopping || current.customArt ||
    JSON.stringify(current.shopping) !== JSON.stringify(original.shopping)) throw new Unchanged(undefined);
  saveCard(state, { ...current, shopping: { ...current.shopping, generatedArt: art } }, context);
}
