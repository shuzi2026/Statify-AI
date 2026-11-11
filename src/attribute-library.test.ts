import { ruleContext } from "./payments/access";
import { afterEach } from "vitest";
import { acceptEntitlement } from "./payments/access";
afterEach(() => acceptEntitlement(null));
const enableTrial = (now: number) =>
  acceptEntitlement({
    member: false,
    trial_ends_at: now + 7 * 86400000,
    trial_available: false,
    initial_adjustment_until: null,
    initial_adjustment: null,
    valid_until: now + 900000,
  });
import { it, expect } from "vitest";
import { fresh } from "./model";
import {
  createAttribute,
  placeAttribute,
  needsDefaultAttributes,
  restoreDefaultAttributes,
} from "./attribute-library";
const at = new Date(2026, 9, 14, 12).getTime();
it("accepts all built-in English attribute names by print width", () => {
  for (const name of [
    "Physique",
    "Memory",
    "Cognition",
    "Focus",
    "Charisma",
    "Creativity",
    "Expression",
  ])
    expect(createAttribute(fresh(at, "cn"), name, 50).name).toBe(name);
  expect(() => createAttribute(fresh(at, "cn"), "字".repeat(9), 50)).toThrow(
    "8个宽字符",
  );
  expect(() => createAttribute(fresh(at, "cn"), "W".repeat(9), 50)).toThrow(
    "8个宽字符",
  );
  expect(createAttribute(fresh(at, "cn"), "i".repeat(16), 50).name).toHaveLength(16);
});
it("free restoration also archives legacy extra slots marked original without losing growth", () => {
  const s = fresh(at, "cn");
  s.attributes.push(
    ...[4, 5].map((slot) => ({
      ...structuredClone(s.attributes[0]),
      id: "legacy-" + slot,
      name: "旧属性" + slot,
      slot,
      earned: 123,
      daily: { "2026-10-24": 37 },
    })),
  );
  const before = s.attributes.map(({ slot, ...a }) => a);
  expect(needsDefaultAttributes(s, true)).toBe(true);
  restoreDefaultAttributes(s, true);
  expect(s.attributes.filter((a) => a.slot >= 0)).toHaveLength(4);
  expect(s.attributes.map(({ slot, ...a }) => a)).toEqual(before);
  expect(needsDefaultAttributes(s, true)).toBe(false);
});
it("library creation validates names and preserves all state on failed placement", () => {
  const s = fresh(at, "cn"),
    a = createAttribute(s, "魅力", 50);
  expect(a.slot).toBe(-1);
  const before = JSON.stringify(s);
  expect(() => createAttribute(s, "魅力", 40)).toThrow(/同名/);
  expect(() => placeAttribute(s, { id: a.id }, 4, ruleContext(at))).toThrow(/试用/);
  expect(JSON.stringify(s)).toBe(before);
  enableTrial(at);
  for (const slot of [0, 3, 6]) {
    const saved = JSON.stringify(s);
    expect(() =>
      placeAttribute(s, { name: "创造力", initial: 50 }, slot, ruleContext(at)),
    ).toThrow(/槽位/);
    expect(JSON.stringify(s)).toBe(saved);
  }
});
it("replacement is unlimited even with an exhausted legacy counter and preserves each attribute growth", () => {
  const s = fresh(at, "cn");
  enableTrial(at);
  s.slotChanges["2026-10"] = 99;
  const old = createAttribute(s, "绘画", 30),
    other = createAttribute(s, "魅力", 50);
  old.earned = 123;
  old.daily = { "2026-10-14": 77 };
  for (let i = 0; i < 20; i++)
    placeAttribute(s, { id: i % 2 ? other.id : old.id }, 4, ruleContext(at));
  expect(old).toMatchObject({
    slot: -1,
    initial: 30,
    earned: 123,
    daily: { "2026-10-14": 77 },
  });
  expect(other.slot).toBe(4);
  expect(s.slotChanges).toEqual({ "2026-10": 99 });
  placeAttribute(s, { id: old.id }, 5, ruleContext(at));
  expect(old).toMatchObject({
    slot: 5,
    earned: 123,
    daily: { "2026-10-14": 77 },
  });
});
