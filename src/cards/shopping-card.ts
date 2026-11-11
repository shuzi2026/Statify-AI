import { SHOPPING_CATEGORY, sameShoppingLink, shoppingCardProduct, type ShoppingReceipt } from "../../shared/shopping-demo";
import { Unchanged } from "../application/commands";
import { dateKey, saveCard } from "../engine";
import { newCard, type Card, type Entry, type State } from "../model";
import type { RuleContext } from "../rules/context";

export function purchasedShoppingCard(state: State, product: NonNullable<ShoppingReceipt["product"]>, cardId?: string) {
  const sourceCard = cardId ? state.cards.find((card) => card.id === cardId && card.shopping) : undefined;
  if (cardId && !sourceCard) throw Error("原购物卡已不存在，请先恢复卡牌后重新保存付款记录。");
  const previousCardId = state.entries.find((entry) => entry.purchase && sameShoppingLink(entry.purchase.url, product.url))?.cardId;
  return sourceCard ?? state.cards.find(({ id, shopping }) => shopping && (
    id === previousCardId ||
    sameShoppingLink(shopping.url, product.url) ||
    (product.productId !== undefined && shopping.productId === product.productId) ||
    (product.kind !== undefined && shopping.kind?.toLocaleLowerCase() === product.kind.toLocaleLowerCase())
  ));
}

export function savePurchasedShoppingCard(state: State, receipt: ShoppingReceipt, context: RuleContext, cardId?: string) {
  if (!receipt.product) throw Error("找不到订单中的商品链接。");
  const product = shoppingCardProduct.parse(receipt.product);
  const entryId = "paypal-" + receipt.orderId;
  if (state.entries.some((entry) => entry.id === entryId)) throw new Unchanged("existing");
  const existing = purchasedShoppingCard(state, receipt.product, cardId);
  let card: Card;
  if (existing) {
    card = existing;
  } else {
    const name = product.kind ?? "Shopping item";
    card = { ...newCard(context.now), name, category: SHOPPING_CATEGORY, shopping: product };
    saveCard(state, card, context);
  }
  const entry: Entry = {
    purchase: { merchant: receipt.merchant, cents: receipt.cents, orderId: receipt.orderId, url: product.url,
      title: receipt.product.title.trim().slice(0, 200) },
    id: entryId,
    cardId: card.id,
    name: card.name,
    method: "instant",
    startedAt: context.now,
    endedAt: context.now,
    date: dateKey(context.now),
    seconds: 0,
    measured: 0,
    quantity: 1,
    counted: false,
    rating: 1,
    coefficient: 1,
    note: "",
    score: 0,
    plans: [],
    rewards: [],
    effects: [],
    values: [],
    legacy: false,
  };
  state.entries.push(entry);
  return existing ? "updated" : "created";
}
