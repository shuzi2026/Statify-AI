import { ruleContext } from "./payments/access";
import { describe, it, expect } from "vitest";
import { fresh, newCard, CardSchema } from "./model";
import { changeCardState, copyCard, start, settle, saveCard } from "./engine";

describe("archive copy names", () => {
  it("keeps the original on copy and numbers only when archived again", () => {
    const s = fresh(Date.now(), "cn"),
      original = { ...newCard(Date.now()), name: "读书" };
    s.cards = [original];
    changeCardState(s, original.id, "archive", Date.now());
    const second = copyCard(s, original.id, Date.now());
    expect(second.name).toBe("读书");
    changeCardState(s, second.id, "archive", Date.now());
    expect(second.name).toBe("读书（2）");
    const third = copyCard(s, CardSchema.parse(second).id, Date.now());
    expect(third.name).toBe("读书");
    changeCardState(s, third.id, "archive", Date.now());
    expect(third.name).toBe("读书（3）");
    expect(original.name).toBe("读书");
  });
  it("does not strip parentheses typed by the user, and avoids existing suffixes", () => {
    const s = fresh(Date.now(), "cn");
    s.cards = [
      { ...newCard(Date.now()), name: "练习（2）", state: "archived" },
      { ...newCard(Date.now()), name: "练习（2）（2）", state: "archived" },
    ];
    const copy = copyCard(s, s.cards[0].id, Date.now());
    expect(copy.name).toBe("练习（2）");
    changeCardState(s, copy.id, "archive", Date.now());
    expect(copy.name).toBe("练习（2）（3）");
  });
  it("uses the same naming for automatic consumable archiving without changing history", () => {
    const s = fresh(Date.now(), "cn");
    s.cards = [{ ...newCard(Date.now()), name: "行动", state: "archived" }];
    const copy = copyCard(s, s.cards[0].id, Date.now());
    copy.life = "consumable";
    const id = start(s, copy.id, Date.now());
    const e = settle(s, id, {
      seconds: 0,
      quantity: 1,
      rating: 1,
      counted: true,
      note: "",
    }, ruleContext(Date.now()));
    expect(copy.name).toBe("行动（2）");
    expect(e.name).toBe("行动");
  });
  it("keeps maximum-length names valid and respects a later explicit rename", () => {
    const s = fresh(Date.now(), "cn");
    s.cards = [{ ...newCard(Date.now()), name: "长".repeat(200), state: "archived" }];
    const copy = copyCard(s, s.cards[0].id, Date.now());
    changeCardState(s, copy.id, "archive", Date.now());
    expect(CardSchema.parse(copy).name).toHaveLength(200);
    saveCard(s, { ...copy, name: "自己命名（2）" }, ruleContext(Date.now()));
    expect(copyCard(s, copy.id, Date.now()).name).toBe("自己命名（2）");
  });
});
