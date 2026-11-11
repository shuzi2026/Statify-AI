import { expect, it, vi } from "vitest";
import { fresh, newCard } from "../model";
import { preparePurchasedReceipt, saveRepairedShoppingArtwork } from "./shopping-artwork";
import { savePurchasedShoppingCard } from "./shopping-card";
import { Unchanged } from "../application/commands";

const now = Date.now();
const context = { now, member: false, trial: false };
const art = { data: "data:image/png;base64,YQ==", transparent: true };
const receipt = { orderId: "TOOTHPASTE1234", merchant: "shop.example", cents: 517,
  product: { title: "Toothpaste", productId: "toothpaste", url: "https://shop.example/toothpaste" } };

it("cuts out a first purchase before saving and never changes receipt identity", async () => {
  const state = fresh(now, "global");
  const prepare = vi.fn(async () => ({ ...receipt.product, url: "https://other.example/wrong", generatedArt: art }));
  const prepared = await preparePurchasedReceipt(state, receipt, undefined, prepare);
  expect(prepare).toHaveBeenCalledOnce();
  expect(prepared).toEqual({ ...receipt, product: { ...receipt.product, generatedArt: art } });
  savePurchasedShoppingCard(state, prepared, context);
  expect(state.cards.find((card) => card.shopping)?.shopping?.generatedArt).toEqual(art);
  const before = structuredClone(state.cards);
  const repeat = { ...receipt, orderId: "REPEATORDER123" };
  await preparePurchasedReceipt(state, repeat, undefined, prepare);
  await preparePurchasedReceipt(state, receipt, undefined, prepare);
  savePurchasedShoppingCard(state, repeat, context);
  expect(prepare).toHaveBeenCalledOnce();
  expect(state.cards).toEqual(before);
});

it("does not block a paid receipt when artwork processing fails", async () => {
  const state = fresh(now, "global");
  const prepared = await preparePurchasedReceipt(state, receipt, undefined, async () => { throw Error("offline"); });
  savePurchasedShoppingCard(state, prepared, context);
  expect(state.entries[0].purchase?.orderId).toBe(receipt.orderId);
});

it("repairs old white-background icons while retaining card settings and purchase logs", () => {
  const state = fresh(now, "global");
  savePurchasedShoppingCard(state, receipt, context);
  const original = structuredClone(state.cards.find((card) => card.shopping)!);
  const before = structuredClone(state);
  saveRepairedShoppingArtwork(state, original, art, context);
  const result = state.cards.find((card) => card.id === original.id)!;
  expect({ ...result, shopping: original.shopping, changes: original.changes }).toEqual(original);
  expect(state.entries).toEqual(before.entries);
  expect(result.shopping?.generatedArt).toEqual(art);
  expect(() => saveRepairedShoppingArtwork(state, original, art, context)).toThrow(Unchanged);
});

it("never overwrites a user image or a product link edited during background processing", () => {
  for (const edit of ["custom", "link", "removed"]) {
    const state = fresh(now, "global");
    const card = { ...newCard(now), shopping: receipt.product };
    state.cards.push(card);
    const original = structuredClone(card);
    if (edit === "custom") card.customArt = art.data;
    if (edit === "link") card.shopping.url = "https://shop.example/replacement";
    if (edit === "removed") state.cards = [];
    const before = structuredClone(state);
    expect(() => saveRepairedShoppingArtwork(state, original, art, context)).toThrow(Unchanged);
    expect(state).toEqual(before);
  }
});
