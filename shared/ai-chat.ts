import { z } from "zod";
import { CardSchema, StateSchema, statusKeys } from "./save-schema";
import { actionRules } from "./rules/actions";
import { attributeRules, rules } from "./rules/growth";
import { statusRules } from "./rules/status";
import { textLimits } from "./rules/text";
import { aiManagementOperation } from "./ai-management";

export const AI_CHAT_PATH = "/__statify_ai/chat";
export const AI_CHAT_STREAM = "application/x-ndjson";
export const AI_CHAT_DEVELOPER_PATH = "/__statify_ai/developer";
export const AI_CHAT_DEVELOPER_SESSION_PATH = "/__statify_ai/developer/session";
export const AI_CHAT_USER_CONTEXT_MESSAGES = 25;
export const AI_CHAT_INPUT_LIMIT = 4_000;
export const GUEST_TEST_PORT = 15292;
export const GUEST_TEST_ORIGIN = `http://127.0.0.1:${GUEST_TEST_PORT}`;
export const GUEST_TEST_RESET_PATH = "/__statify_guest_test/reset";
export const walkChatPhase = z.enum(["walking", "reflection"]);
export type WalkChatPhase = z.infer<typeof walkChatPhase>;

const draftFields = z.strictObject({
  name: z.string().trim().pipe(CardSchema.shape.name),
  category: CardSchema.shape.category,
  method: z.enum(["instant", "duration", "timed"]),
  minutes: z.int().min(1).max(actionRules.maxTargetMinutes).nullable(),
  rewards: z.array(z.strictObject({
    id: z.enum(["attr-body", "attr-mem", "attr-know", "attr-foc"]),
    amount: z.int().min(1).max(rules.dailyExperience),
  })).max(4),
  effects: z.array(z.strictObject({
    id: z.enum(statusKeys),
    amount: z.int().min(-statusRules.max).max(statusRules.max),
  })).max(statusKeys.length),
  reason: z.string().trim().min(1).max(500),
});

function validDraft(draft: z.infer<typeof draftFields>) {
  return (draft.method === "duration") === (draft.minutes !== null) &&
    new Set(draft.rewards.map(({ id }) => id)).size === draft.rewards.length &&
    new Set(draft.effects.map(({ id }) => id)).size === draft.effects.length;
}

export const aiCardDraftArguments = draftFields.extend({
  timingEvidence: z.string().trim().max(200),
}).refine(validDraft);
export const aiCardProposal = draftFields.extend({ type: z.literal("propose_card") }).refine(validDraft);
export type AiCardProposal = z.infer<typeof aiCardProposal>;

export const aiCardEditArguments = z.strictObject({
  cardName: draftFields.shape.name,
  name: draftFields.shape.name.nullable(),
  category: draftFields.shape.category.nullable(),
  method: CardSchema.shape.method.nullable(),
  minutes: draftFields.shape.minutes,
  unit: z.string().trim().min(1).max(textLimits.unit).nullable(),
  message: z.string().max(textLimits.message).nullable(),
});

export const aiStatusArguments = z.strictObject({
  changes: z.array(z.strictObject({
    id: z.enum(statusKeys),
    mode: z.enum(["set", "add"]),
    value: z.int().min(-statusRules.max).max(statusRules.max),
  })).min(1).max(statusKeys.length),
});

export const aiInitialArguments = z.strictObject({
  changes: z.array(z.strictObject({
    attribute: z.string().trim().min(1).max(200),
    value: z.int().min(0).max(attributeRules.maxLevel).multipleOf(10),
  })).min(1).max(attributeRules.totalSlots),
});

export const aiExistingOperation = z.discriminatedUnion("type", [
  aiCardEditArguments.extend({ type: z.literal("edit_card") }),
  aiStatusArguments.extend({ type: z.literal("adjust_status") }),
  aiInitialArguments.extend({ type: z.literal("adjust_initial_levels") }),
]);
const searchText = z.string().trim().min(1).max(200);
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const recordedNote = z.string().trim().min(1).max(textLimits.note);
export const aiHistoryArguments = z.strictObject({
  view: z.enum(["journal", "purchases", "growth", "attribute", "status", "check_ins", "cards", "attributes", "current_status", "plans", "meters", "meter_history"]),
  period: z.enum(["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "recent", "all"]),
  from: dateText.nullable(),
  to: dateText.nullable(),
  cardName: searchText.nullable(),
  attribute: searchText.nullable(),
  status: z.enum(statusKeys).nullable(),
  keyword: searchText.nullable(),
  offset: z.int().min(0).max(1_000_000).nullable().optional(),
});
export const AI_READ_LIMIT = 5;
export const aiReadObservation = z.strictObject({
  title: z.string().max(300),
  count: z.int().nonnegative(),
  offset: z.int().nonnegative(),
  rows: z.array(z.string().max(3_000)).max(20),
  truncated: z.boolean(),
  observedAt: z.string().max(100),
});
export type AiReadObservation = z.infer<typeof aiReadObservation>;
export const aiReadContinuation = z.strictObject({
  continuation: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  observation: aiReadObservation,
});
export const aiStartArguments = z.strictObject({ cardName: searchText });
export const aiRecordArguments = z.strictObject({
  cardName: searchText.nullable(),
  minutes: z.int().min(1).max(actionRules.maxSeconds / 60).nullable(),
  quantity: z.int().min(1).max(actionRules.maxQuantity).nullable(),
  note: recordedNote.nullable(),
});
export const aiNoteArguments = z.strictObject({
  cardName: searchText.nullable(),
  date: dateText.nullable(),
  note: recordedNote,
});
export const aiActivityOperation = z.discriminatedUnion("type", [
  aiHistoryArguments.extend({ type: z.literal("read_activity") }),
  aiStartArguments.extend({ type: z.literal("start_card") }),
  aiRecordArguments.extend({ type: z.literal("record_card") }),
  aiNoteArguments.extend({ type: z.literal("append_journal_note") }),
]);
export const aiReadProfileArguments = z.strictObject({
  field: z.enum(["name", "age", "both"]),
});
export const aiEditProfileArguments = z.strictObject({
  name: z.string().trim().min(1).max(textLimits.nickname).nullable(),
  age: StateSchema.shape.profile.shape.age.nullable(),
});
const aiProfileOperation = z.discriminatedUnion("type", [
  aiReadProfileArguments.extend({ type: z.literal("read_profile") }),
  aiEditProfileArguments.extend({ type: z.literal("edit_profile") }),
]);
export const aiOperation = z.union([aiCardProposal, aiExistingOperation, aiActivityOperation, aiProfileOperation, aiManagementOperation]);
export type AiExistingOperation = z.infer<typeof aiExistingOperation>;
export type AiActivityOperation = z.infer<typeof aiActivityOperation>;
export type AiProfileOperation = z.infer<typeof aiProfileOperation>;

export type AiChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type DeveloperThread = { id: string; title: string };

export const DEVELOPER_REVIEW_LIMIT = 50;

export type DeveloperChange = {
  path: string;
  kind: "added" | "modified" | "deleted";
  state: "ready" | "conflict" | "unsupported";
  diff?: string;
};

export type DeveloperReview = { id: string; files: DeveloperChange[]; omitted: number };

export function developerUnlockPrompt(message: string) {
  const command = message.trim().replace(/[。.!！?？]+$/, "").trim();
  const chinese = command.replace(/\s/g, "");
  if (
    chinese === "我是开发者" ||
    /^(?:(?:我)?(?:想要?|要|希望)|请(?:帮我)?|帮我|(?:可以|能(?:不能)?)(?:帮我)?)?(?:打开|开启|启用|进入|进|切换到|切换为|切到)(?:一下)?开发(?:者)?模式(?:一下)?[吧吗么]?$/.test(chinese)
  ) return "请输入密钥";

  const english = command.replace(/\s+/g, " ");
  if (
    /^i am (?:a |the )?developer$/i.test(english) ||
    /^(?:please |(?:can|could|would) you (?:please )?|i (?:want|would like) to |i['’]d like to )?(?:enter|open|enable|activate|switch to|turn on) (?:the )?developer mode(?: please)?$/i.test(english)
  ) return "Enter the developer key.";

  return null;
}

export function recentAiChatMessages(messages: AiChatMessage[]) {
  if (!messages.length) return messages;
  let start = messages.length - 1;
  let size = JSON.stringify(messages[start]).length + 2;
  // Keep complete turns so the retained history always starts with a user message.
  while (start >= 2 && messages.length - start + 2 <= AI_CHAT_USER_CONTEXT_MESSAGES) {
    const pairSize = JSON.stringify(messages[start - 2]).length + JSON.stringify(messages[start - 1]).length + 2;
    if (size + pairSize > 32_000) break;
    size += pairSize;
    start -= 2;
  }
  return messages.slice(start);
}
