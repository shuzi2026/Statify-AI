import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PurchaseHistory } from "./PurchaseHistory";
import { savePurchasedShoppingCard } from "./shopping-card";
import { fresh } from "../model";
import { journalSentence } from "../journal/read-model";

it("shows the historical product link and price with a payment record on the card back", () => {
  const state = fresh(Date.now(), "global");
  savePurchasedShoppingCard(state, { merchant: "shop.example", cents: 349, orderId: "ORDERHISTORY123",
    product: { title: "Dish soap", url: "https://shop.example/order-product" } },
  { now: Date.now(), member: false, trial: false });
  const entry = state.entries[0];
  entry.note = "See https://shop.example/receipt";
  const html = renderToStaticMarkup(createElement(PurchaseHistory, { card: state.cards.find((card) => card.id === entry.cardId), entries: [entry] }));
  expect(html).toContain('href="https://shop.example/order-product"');
  expect(html).toContain('href="https://shop.example/receipt"');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain("US$3.49");
  expect(html).toContain("ORDERHISTORY123");
  expect(html).toContain("purchase-expand-icon");
  expect(html).toContain('<details class="purchase-details"><summary>');
  expect(html).not.toContain("<header>");
  expect(html).not.toContain("<summary>付款明细</summary>");
  expect(html).not.toContain(' open=""');
  expect(journalSentence("Mila", entry)).toContain("US$3.49");
});
