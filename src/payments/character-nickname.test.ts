import { it, expect } from "vitest";
import { accountNickname } from "./character-nickname";
it("matches the deployed twenty Unicode character boundary without truncating local names", () => {
  expect(accountNickname("  " + "甲".repeat(20) + "  ")).toBe("甲".repeat(20));
  for (const length of [21, 30])
    expect(() => accountNickname("甲".repeat(length))).toThrow("最多20");
  expect(accountNickname("😀".repeat(20))).toBe("😀".repeat(20));
  expect(() => accountNickname("😀".repeat(21))).toThrow("最多20");
});
it("rejects empty and control-character nicknames without silently rewriting them", () => {
  expect(() => accountNickname("  ")).toThrow("请填写");
  for (const value of ["甲\n乙", "甲\t乙", "甲\u007f乙"])
    expect(() => accountNickname(value)).toThrow("控制字符");
  expect(accountNickname("<玩家>")).toBe("<玩家>");
});
