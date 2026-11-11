import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readChatHistory, saveChatHistory } from "./chat-history";
import { acceptDraftEpoch } from "../local-data/draft-epoch";

const character = { region: "global" as const, createdAt: 100 };
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  acceptDraftEpoch("first");
});
afterEach(() => { acceptDraftEpoch(null); vi.unstubAllGlobals(); });

it("restores multiple conversations, selection and the draft while excluding tool operations", () => {
  const saved = { conversations: [
    { messages: [{ role: "user" as const, content: "Buy toothpaste" }, { role: "assistant" as const, content: "Here are your offers." }], draft: "" },
    { messages: [], draft: "Next message", proposal: { name: "Do not replay" } },
  ], conversation: 1 };
  expect(saveChatHistory(character, saved)).toBe(true);
  expect(readChatHistory(character)).toEqual({ conversations: [
    { messages: saved.conversations[0].messages, draft: "" }, { messages: [], draft: "Next message" },
  ], conversation: 1 });
  expect(readChatHistory({ ...character, createdAt: 101 }).conversations[0].messages).toEqual([]);
  acceptDraftEpoch("reset");
  expect(readChatHistory(character).conversations[0].draft).toBe("");
});

it("keeps chat usable when local storage is blocked", () => {
  vi.stubGlobal("localStorage", { getItem: () => { throw Error("blocked"); }, setItem: () => { throw Error("blocked"); } });
  expect(readChatHistory(character)).toEqual({ conversations: [{ messages: [], draft: "" }], conversation: 0 });
  expect(saveChatHistory(character, readChatHistory(character))).toBe(false);
});
