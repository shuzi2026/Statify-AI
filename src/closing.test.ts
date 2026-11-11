import { ruleContext } from "./payments/access";
import { afterEach, describe, it, expect } from "vitest";
import { acceptEntitlement } from "./payments/access";
import { StateSchema, CardSchema, fresh, newCard } from "./model";
import { parseImport } from "./migrate";
import { saveCard } from "./engine";
import { packState, unpackState } from "./storage-format";
describe("0.2.2 save compatibility and editable card artwork", () => {
  afterEach(() => acceptEntitlement(null));
  it("reads a 0.2.1 save without clearing growth, records or running actions", () => {
    const s = fresh(Date.now(), "cn"),
      legacy = JSON.parse(JSON.stringify(s));
    legacy.version = "0.2.1";
    delete legacy.preferences;
    legacy.cards = [newCard(Date.now())];
    legacy.cards[0].name = "旧卡";
    delete legacy.cards[0].message;
    delete legacy.cards[0].artwork;
    delete legacy.cards[0].customArt;
    legacy.attributes[0].earned = 321;
    const result = parseImport(legacy);
    expect(result.version).toBe("0.2.2");
    expect(result.attributes[0].earned).toBe(321);
    expect(result.preferences.earlyCompletion).toBe("ask");
    expect(result.cards[0]).toMatchObject({
      name: "旧卡",
      message: "",
      artwork: "auto",
      customArt: "",
    });
  });
  it("keeps card artwork and preferences through packed export and import", () => {
    acceptEntitlement({
      member: true,
      trial_ends_at: null,
      trial_available: false,
      initial_adjustment_until: null,
      initial_adjustment: null,
      valid_until: Date.now() + 60000,
    });
    const s = fresh(Date.now(), "cn"),
      c = {
        ...newCard(Date.now()),
        name: "自定义",
        message: "继续前进",
        artwork: "reading" as const,
        customArt: "data:image/png;base64,aGVsbG8=",
      };
    saveCard(s, c, ruleContext(Date.now()));
    s.preferences.earlyCompletion = "record";
    const restored = StateSchema.parse(unpackState(packState(s)));
    expect(restored.cards[0]).toEqual(s.cards[0]);
    expect(restored.preferences).toEqual(s.preferences);
  });
  it("rejects executable or remote image sources and oversized data", () => {
    for (const customArt of [
      "javascript:alert(1)",
      "https://example.com/image.png",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:image/png;base64," + "A".repeat(1500001),
    ])
      expect(
        CardSchema.safeParse({ ...newCard(Date.now()), name: "test", customArt }).success,
      ).toBe(false);
  });
});
