import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { CardTile } from "./CardTile";
import { ShoppingCardFace } from "./ShoppingCardTile";
import { fresh, newCard } from "../model";

test("shopping cards use the normal management row and print the action inside the card", () => {
  const now = Date.now();
  const s = fresh(now, "global");
  const card = { ...newCard(now), name: "Chips", category: "Shopping", shopping: { url: "https://shop.example/chips" } };
  const noop = () => {};
  const html = renderToStaticMarkup(createElement(CardTile, { card, s, now, begin: noop, edit: noop,
    open: noop, favorite: noop, remove: noop }));
  expect(html).toContain('data-card-pattern="vertical-stripes"');
  expect(html).toContain('class="fan-card-method">购物</span>');
  expect(html).toContain("card-management-actions");
  expect(html).not.toContain("18 fl oz");
  const demoFace = renderToStaticMarkup(createElement(ShoppingCardFace));
  expect(demoFace).toContain('class="fan-card-method">购物</span>');
  expect(demoFace).not.toContain("18 fl oz");
});
