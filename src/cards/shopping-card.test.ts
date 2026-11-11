import { expect, it } from "vitest";
import { StateSchema, fresh, newCard } from "../model";
import { Unchanged } from "../application/commands";
import { savePurchasedShoppingCard } from "./shopping-card";

it("persists a first purchase without duplicating the card or replacing its link", () => {
  const now = Date.now();
  const state = fresh(now, "global");
  const context = { now, member: false, trial: false };
  const url = "https://buy.trychannel3.com/cup-link?o=selected&aid=first";
  const first = { merchant: "shop.example", cents: 1200, orderId: "FIRSTORDER123" };
  const receipt = { ...first, product: { title: "Brand's Steel cup 12 oz", kind: "Cup", productId: "cup", url, lastPurchase: first } };
  expect(savePurchasedShoppingCard(state, receipt, context)).toBe("created");
  expect(() => savePurchasedShoppingCard(state, receipt, context)).toThrow(Unchanged);
  const original = structuredClone(state.cards.find((card) => card.shopping)!);
  const second = { ...first, cents: 1350, orderId: "SECONDORDER123" };
  expect(savePurchasedShoppingCard(state, {
    ...second, product: { ...receipt.product, url: url.replace("first", "second"), lastPurchase: second },
  }, context)).toBe("updated");
  expect(state.cards.find((card) => card.id === original.id)).toEqual(original);
  expect(state.entries).toHaveLength(2);
  expect(state.entries[1].purchase?.orderId).toBe("SECONDORDER123");
  expect(() => savePurchasedShoppingCard(state, {
    ...second, product: { ...receipt.product, url: url.replace("selected", "other"), lastPurchase: second },
  }, context)).toThrow(Unchanged);
  expect(StateSchema.parse(state).cards.filter(({ shopping }) => shopping)).toEqual([
    expect.objectContaining({ name: "Cup", category: "Shopping",
      shopping: expect.objectContaining({ url, lastPurchase: first }) }),
  ]);
});

it("keeps different products and merchants under the selected shopping card", () => {
  const now = Date.now();
  const state = fresh(now, "global");
  const context = { now, member: false, trial: false };
  const card = { ...newCard(now), name: "Dish soap", shopping: { url: "https://first.example/soap", productId: "original-soap" } };
  state.cards.push(card);
  const before = structuredClone(state.cards);
  for (const [index, merchant] of ["first.example", "second.example"].entries()) {
    savePurchasedShoppingCard(state, { merchant, cents: 349 + index * 50, orderId: `NEWPURCHASE${index}123`,
      product: { title: "Different soap", productId: `new-soap-${index}`, url: `https://${merchant}/different-soap` } },
    { ...context, now: now + index }, card.id);
  }
  expect(state.cards).toEqual(before);
  expect(state.entries.map((entry) => entry.cardId)).toEqual([card.id, card.id]);
  expect(state.entries[0].purchase?.title).toBe("Different soap");
  expect(state.entries.map((entry) => entry.purchase?.url)).toEqual([
    "https://first.example/different-soap", "https://second.example/different-soap",
  ]);
  savePurchasedShoppingCard(state, { merchant: "second.example", cents: 399, orderId: "THIRDPURCHASE123",
    product: { title: "Previously bought soap", url: "https://second.example/different-soap" } }, context);
  expect(state.cards).toEqual(before);
  expect(state.entries.at(-1)?.cardId).toBe(card.id);
});

it("creates a separate toothpaste card after a previous dish soap purchase", () => {
  const now = Date.now();
  const state = fresh(now, "global");
  const context = { now, member: false, trial: false };
  savePurchasedShoppingCard(state, { merchant: "shop.example", cents: 399, orderId: "SOAPORDER1234",
    product: { title: "Dish soap", kind: "Dish soap", productId: "soap", url: "https://shop.example/soap" } }, context);
  const soap = structuredClone(state.cards.find((card) => card.shopping)!);
  savePurchasedShoppingCard(state, { merchant: "shop.example", cents: 199, orderId: "TOOTHPASTE1234",
    product: { title: "Toothpaste", kind: "Toothpaste", productId: "toothpaste", url: "https://shop.example/toothpaste" } }, context);
  expect(state.cards.filter((card) => card.shopping).map((card) => card.name)).toEqual(["Dish soap", "Toothpaste"]);
  expect(state.cards.find((card) => card.id === soap.id)).toEqual(soap);
  expect(state.entries[0].cardId).not.toBe(state.entries[1].cardId);
});

it("names cards by product type and keeps a new brand's details in its own receipt", () => {
  const now = Date.now();
  const state = fresh(now, "global");
  const context = { now, member: false, trial: false };
  const first = { merchant: "first.example", cents: 517, orderId: "FIRSTPASTE1234",
    product: { title: "Tom's of Maine Antiplaque Toothpaste 5.5 oz", kind: "Toothpaste",
      productId: "toms", url: "https://first.example/toms" } };
  savePurchasedShoppingCard(state, first, context);
  const card = structuredClone(state.cards.find((card) => card.shopping)!);
  expect(card.name).toBe("Toothpaste");
  const second = { merchant: "second.example", cents: 399, orderId: "SECONDPASTE123",
    product: { title: "Colgate Cavity Protection Toothpaste 6 oz", kind: "Toothpaste",
      productId: "colgate", url: "https://second.example/colgate" } };
  expect(savePurchasedShoppingCard(state, second, context)).toBe("updated");
  expect(state.cards.filter((card) => card.shopping)).toEqual([card]);
  expect(state.entries.map((entry) => [entry.cardId, entry.purchase?.title, entry.purchase?.url, entry.purchase?.cents])).toEqual([
    [card.id, first.product.title, first.product.url, 517],
    [card.id, second.product.title, second.product.url, 399],
  ]);
  expect(StateSchema.safeParse(state).success).toBe(true);
});

it("does not use a branded title as a card name when restoring an older order without a type", () => {
  const state = fresh(Date.now(), "global");
  savePurchasedShoppingCard(state, { merchant: "shop.example", cents: 517, orderId: "LEGACYPASTE123",
    product: { title: "Brand Promotional Product Title", url: "https://shop.example/paste" } },
  { now: Date.now(), member: false, trial: false });
  expect(state.cards.find((card) => card.shopping)?.name).toBe("Shopping item");
  expect(state.entries[0].purchase?.title).toBe("Brand Promotional Product Title");
});

it("records a repurchase without changing a customized card or other character data", () => {
  const now = Date.now();
  const state = fresh(now, "global");
  const context = { now, member: false, trial: false };
  const card = { ...newCard(now), name: "My soap", favorite: true, state: "abandoned" as const,
    customArt: "data:image/png;base64,YQ==", category: "Household",
    shopping: { productId: "soap", url: "https://shop.example/soap", generatedArt: {
      data: "data:image/png;base64,Yg==", transparent: true,
    } } };
  state.cards.push(card);
  const before = structuredClone(state);
  const receipt = { merchant: "another.example", cents: 449, orderId: "REPEATORDER123",
    product: { title: "Seller renamed soap", productId: "soap", url: "https://another.example/soap" } };
  expect(savePurchasedShoppingCard(state, receipt, context)).toBe("updated");
  expect({ ...state, entries: before.entries }).toEqual(before);
  expect(state.entries.at(-1)).toMatchObject({ cardId: card.id, name: "My soap", counted: false,
    score: 0, rewards: [], effects: [], values: [], purchase: {
      merchant: receipt.merchant, cents: receipt.cents, orderId: receipt.orderId, url: receipt.product.url,
    } });
  const recorded = structuredClone(state);
  expect(() => savePurchasedShoppingCard(state, receipt, context)).toThrow(Unchanged);
  expect(state).toEqual(recorded);
  expect(StateSchema.safeParse(state).success).toBe(true);
});
