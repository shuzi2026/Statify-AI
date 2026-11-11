import { ruleContext } from "./access";
import { afterEach, expect, it } from "vitest";
import { fresh, newCard } from "../model";
import { saveCard } from "../engine";
import { placeAttribute } from "../attribute-library";
import { acceptEntitlement } from "./access";
const now = Date.now(),
  image = "data:image/png;base64,aGVsbG8=";
const member = () =>
  acceptEntitlement({
    member: true,
    trial_ends_at: null,
    trial_available: false,
    initial_adjustment_until: null,
    initial_adjustment: null,
    valid_until: now + 60000,
  });
afterEach(() => acceptEntitlement(null));
it("free accounts cannot write new custom card images and denial leaves the save unchanged", () => {
  const s = fresh(now, "cn"),
    before = structuredClone(s);
  expect(() =>
    saveCard(s, { ...newCard(now), name: "新图片", customArt: image }, ruleContext(now)),
  ).toThrow(/会员/);
  expect(s).toEqual(before);
  expect(() =>
    placeAttribute(s, { name: "创造力", initial: 50 }, 0, ruleContext(now)),
  ).toThrow();
  expect(() =>
    placeAttribute(s, { name: "创造力", initial: 50 }, 4, ruleContext(now)),
  ).toThrow();
  expect(s).toEqual(before);
});
it("membership allows upload, and revocation preserves existing images and ordinary editing", () => {
  const s = fresh(now, "cn");
  member();
  const c = { ...newCard(now), name: "保留图片", customArt: image };
  saveCard(s, c, ruleContext(now));
  acceptEntitlement(null);
  saveCard(s, { ...s.cards[0], name: "修改标题" }, ruleContext(now));
  expect(s.cards[0].customArt).toBe(image);
  const before = structuredClone(s);
  expect(() =>
    saveCard(
      s,
      { ...s.cards[0], customArt: "data:image/png;base64,bmV3" },
      ruleContext(now),
    ),
  ).toThrow(/会员/);
  expect(s).toEqual(before);
  saveCard(s, { ...s.cards[0], customArt: "", artwork: "reading" }, ruleContext(now));
  expect(s.cards[0].customArt).toBe("");
});
it("expired membership and save-file membership claims cannot authorize image upload", () => {
  const s = fresh(now, "cn");
  Object.assign(s, { member: true });
  member();
  const before = structuredClone(s);
  expect(() =>
    saveCard(
      s,
      { ...newCard(now), name: "过期上传", customArt: image },
      ruleContext(now + 60001),
    ),
  ).toThrow(/会员/);
  expect(s).toEqual(before);
});
