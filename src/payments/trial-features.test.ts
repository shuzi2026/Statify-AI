import { ruleContext } from "./access";
import { afterEach, expect, it } from "vitest";
import { fresh, newCard } from "../model";
import { saveCard } from "../engine";
import { placeAttribute } from "../attribute-library";
import {
  acceptEntitlement,
  memberActive,
  memberFeaturesActive,
  type Entitlement,
} from "./access";

const now = Date.now(),
  image = "data:image/png;base64,aGVsbG8=";
const trial = (overrides: Partial<Entitlement> = {}): Entitlement => ({
  member: false,
  trial_ends_at: now + 1000,
  trial_available: false,
  initial_adjustment_until: null,
  initial_adjustment: null,
  valid_until: now + 2000,
  ...overrides,
});
afterEach(() => acceptEntitlement(null));

it("a verified trial can save a custom image without acquiring paid membership", () => {
  acceptEntitlement(trial());
  const s = fresh(now, "cn"),
    card = { ...newCard(now), name: "测试图片", customArt: image };
  saveCard(s, card, ruleContext(now));
  expect(s.cards[0].customArt).toBe(image);
  expect(memberFeaturesActive(now)).toBe(true);
  expect(memberActive(now)).toBe(false);
});

it.each([
  ["trial deadline", trial(), now + 1000],
  ["entitlement deadline", trial({ valid_until: now + 500 }), now + 500],
] as const)(
  "%s blocks new images at the exact boundary and preserves saved content",
  (_name, grant, deadline) => {
    acceptEntitlement(grant);
    const s = fresh(now, "cn"),
      card = { ...newCard(now), name: "测试图片", customArt: image };
    saveCard(s, card, ruleContext(now));
    expect(memberFeaturesActive(deadline - 1)).toBe(true);
    expect(memberFeaturesActive(deadline)).toBe(false);
    const before = structuredClone(s);
    expect(() =>
      saveCard(
        s,
        { ...s.cards[0], customArt: "data:image/png;base64,bmV3" },
        ruleContext(deadline),
      ),
    ).toThrow(/会员/);
    expect(s).toEqual(before);
    saveCard(s, { ...s.cards[0], name: "保留旧图" }, ruleContext(deadline));
    expect(s.cards[0].customArt).toBe(image);
  },
);

it("revocation immediately closes trial features while retaining existing images", () => {
  acceptEntitlement(trial());
  const s = fresh(now, "cn");
  saveCard(s, { ...newCard(now), name: "测试图片", customArt: image }, ruleContext(now));
  acceptEntitlement(null);
  expect(memberFeaturesActive(now)).toBe(false);
  const before = structuredClone(s);
  expect(() =>
    saveCard(
      s,
      {
        ...newCard(now),
        name: "新上传",
        customArt: "data:image/png;base64,bmV3",
      },
      ruleContext(now),
    ),
  ).toThrow(/会员/);
  expect(s).toEqual(before);
});

it("trial image access retains the paid-only restriction on the first four attribute slots", () => {
  acceptEntitlement(trial());
  const s = fresh(now, "cn"),
    before = structuredClone(s);
  expect(() =>
    placeAttribute(s, { name: "前四替换", initial: 50 }, 0, ruleContext(now)),
  ).toThrow();
  expect(s).toEqual(before);
  placeAttribute(s, { name: "试用属性", initial: 50 }, 4, ruleContext(now));
  expect(s.attributes.find((a) => a.name === "试用属性")?.slot).toBe(4);
});
