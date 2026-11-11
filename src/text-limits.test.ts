import { ruleContext } from "./payments/access";
import { describe, it, expect } from "vitest";
import { fresh, newCard } from "./model";
import { saveCard, copyCard, changeCardState } from "./engine";
import { createAttribute } from "./attribute-library";
import {
  checkTextLength,
  cardNameWidth,
} from "./text-limits";
describe("new text limits preserve existing records", () => {
  it("estimates display width without counting combining marks separately", () => {
    expect(cardNameWidth("读abc")).toBe(2.5);
    expect(cardNameWidth("e\u0301")).toBe(cardNameWidth("e"));
  });
  it("retains the existing save-format limit independently of card title layout", () => {
    const s = fresh(Date.now(), "cn"),
      c = { ...newCard(Date.now()), name: "长".repeat(200) };
    saveCard(s, c, ruleContext(Date.now()));
    expect(() => saveCard(s, { ...c, name: c.name + "长" }, ruleContext(Date.now()))).toThrow();
    expect(s.cards[0].name).toBe(c.name);
  });
  it("still checks new attribute names against their print width", () => {
    const s = fresh(Date.now(), "cn");
    expect(() => createAttribute(s, "字".repeat(9), 50)).toThrow("最多8");
    expect(createAttribute(s, "字".repeat(8), 50).name).toHaveLength(8);
  });
  it("old overlong names survive unrelated edits, copies and archive numbering", () => {
    const s = fresh(Date.now(), "cn"),
      c = { ...newCard(Date.now()), name: "历史名称".repeat(20) };
    s.cards.push(c);
    saveCard(s, { ...c, message: "保留历史名称" }, ruleContext(Date.now()));
    expect(s.cards[0].name).toBe(c.name);
    changeCardState(s, c.id, "archive", Date.now());
    const copy = copyCard(s, c.id, Date.now());
    expect(copy.name).toBe(c.name);
    saveCard(s, { ...copy, message: "只修改其他字段" }, ruleContext(Date.now()));
    changeCardState(s, copy.id, "archive", Date.now());
    expect(s.cards.find((x) => x.id === copy.id)!.name).toBe(c.name + "（2）");
  });
  it("uses the same emoji counting as HTML input maxlength", () => {
    expect(() => checkTextLength("😀".repeat(4), 8, "名称")).not.toThrow();
    expect(() => checkTextLength("😀".repeat(5), 8, "名称")).toThrow();
  });
});
