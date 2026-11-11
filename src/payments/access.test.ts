import { ruleContext } from "./access";
import { afterEach, it, expect } from "vitest";
import { fresh } from "../model";
import { attrAllowed } from "../engine";
import {
  createAttribute,
  placeAttribute,
  moveAttribute,
  restoreDefaultAttributes,
} from "../attribute-library";
import { acceptEntitlement, memberActive } from "./access";
import { validateState } from "../migrate";
const now = Date.now();
afterEach(() => acceptEntitlement(null));
it("imported membership claims cannot grant paid access", () => {
  const s = validateState({
    ...fresh(now, "cn"),
    member: true,
    trialStarted: now,
    entitlement: { member: true, valid_until: now + 1e9 },
  });
  expect(memberActive(now)).toBe(false);
  expect(() =>
    placeAttribute(s, { name: "伪造试用", initial: 50 }, 4, ruleContext(now)),
  ).toThrow();
  expect(() =>
    placeAttribute(s, { name: "创造力", initial: 50 }, 0, ruleContext(now)),
  ).toThrow();
});
it("cross-region player imports are rejected", () => {
  expect(() => validateState({ ...fresh(now, "cn"), region: "global" })).toThrow(
    /区域/,
  );
});
it("verified membership enables six slots, sorting costs nothing; revocation restores default identities with history", () => {
  const s = fresh(now, "cn");
  acceptEntitlement({
    member: true,
    trial_ends_at: null,
    trial_available: false,
    initial_adjustment_until: null,
    initial_adjustment: null,
    valid_until: now + 900000,
  });
  const original = s.attributes[0];
  original.earned = 123;
  const custom = createAttribute(s, "创造力", 40);
  placeAttribute(s, { id: custom.id }, 0, ruleContext(now));
  expect(attrAllowed(s, custom, ruleContext(now))).toBe(true);
  const counts = JSON.stringify(s.slotChanges);
  moveAttribute(s, custom.id, 3, ruleContext(now));
  expect(JSON.stringify(s.slotChanges)).toBe(counts);
  expect(memberActive(now + 900001)).toBe(false);
  expect(attrAllowed(s, custom, ruleContext(now + 900001))).toBe(false);
  acceptEntitlement(null);
  restoreDefaultAttributes(s);
  expect(original).toMatchObject({ slot: 0, earned: 123 });
  expect(custom.slot).toBe(-1);
  expect(
    new Set(s.attributes.filter((a) => a.slot >= 0).map((a) => a.slot)).size,
  ).toBe(4);
});
