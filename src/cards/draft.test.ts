import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fresh, newCard } from "../model";
import { discardCardDraft, readCardDraft, writeCardDraft } from "./draft";

let values: Map<string, string>;
let serial = 0;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const fixture = () => {
  const s = fresh(1700000000000 + serial++, "cn");
  return {
    s,
    key: "life-rpg-card-draft:" + s.createdAt,
    draft: { step: 3, card: { ...newCard(s.createdAt), name: "未提交卡牌" } },
  };
};

it("keeps legacy valid drafts and rejects malformed or already committed card identities", () => {
  const { s, key, draft } = fixture();
  values.set(key, JSON.stringify(draft));
  expect(readCardDraft(s)).toEqual(draft);
  values.set(key, "{");
  expect(readCardDraft(s)).toBeNull();
  values.set(key, JSON.stringify(draft));
  s.cards.push({ ...draft.card, name: "已经保存的新配置" });
  expect(readCardDraft(s)).toBeNull();
  expect(s.cards[0].name).toBe("已经保存的新配置");
});

it("uses an empty marker if deletion alone fails, without touching unrelated data", () => {
  const { s, key, draft } = fixture();
  values.set(key, JSON.stringify(draft));
  values.set("unrelated", "keep");
  vi.spyOn(sessionStorage, "removeItem").mockImplementation(() => {
    throw Error("denied");
  });
  discardCardDraft(s);
  expect(JSON.parse(values.get(key)!)).toBeNull();
  expect(readCardDraft(s)).toBeNull();
  expect(values.get("unrelated")).toBe("keep");
});

it("does not revive cancelled input when both cleanup methods fail and retries only its key after storage recovers", () => {
  const { s, key, draft } = fixture();
  writeCardDraft(s, draft);
  values.set("unrelated", "keep");
  const remove = vi
    .spyOn(sessionStorage, "removeItem")
    .mockImplementation(() => {
      throw Error("denied");
    });
  const write = vi.spyOn(sessionStorage, "setItem").mockImplementation(() => {
    throw Error("full");
  });
  expect(() => discardCardDraft(s)).not.toThrow();
  expect(readCardDraft(s)).toBeNull();
  expect(values.get(key)).toBe(JSON.stringify(draft));
  remove.mockRestore();
  write.mockRestore();
  expect(readCardDraft(s)).toBeNull();
  expect(values.has(key)).toBe(false);
  expect(values.get("unrelated")).toBe("keep");
  const next = {
    ...draft,
    card: { ...newCard(s.createdAt), name: "新的草稿" },
  };
  writeCardDraft(s, next);
  expect(readCardDraft(s)).toEqual(next);
});
