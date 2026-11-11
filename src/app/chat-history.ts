import { z } from "zod";
import { chatHistorySlot } from "../local-data/registered-storage";
import type { State } from "../model";

const history = z.object({
  conversations: z.array(z.object({
    messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
    draft: z.string(),
  })).min(1),
  conversation: z.int().nonnegative(),
});
type Character = Pick<State, "region" | "createdAt">;
export type ChatHistory = z.infer<typeof history>;

export function readChatHistory(character: Character): ChatHistory {
  try {
    const raw = chatHistorySlot(character).read().value;
    const saved = raw && history.safeParse(JSON.parse(raw)).data;
    if (saved && saved.conversation < saved.conversations.length) return saved;
  } catch { /* Keep the chat usable if browser storage is unavailable. */ }
  return { conversations: [{ messages: [], draft: "" }], conversation: 0 };
}

export function saveChatHistory(character: Character, value: ChatHistory) {
  // Store dialogue and drafts only. Restoring a conversation cannot replay tools.
  const saved = history.parse(value);
  return chatHistorySlot(character).write(JSON.stringify(saved)) === "saved";
}
