import { z } from "zod";
import { CardSchema, statusKeys } from "./save-schema";
import { actionRules, meterRules } from "./rules/actions";
import { attributeRules, rules } from "./rules/growth";
import { planRules } from "./rules/plans";
import { statusRules } from "./rules/status";
import { textLimits } from "./rules/text";

const name = z.string().trim().min(1).max(120);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const meterValue = z.int().min(-meterRules.absoluteLimit).max(meterRules.absoluteLimit);
const limit = z.strictObject({ mode: z.enum(["set", "clear"]), value: meterValue.nullable() }).nullable();
const planScope = {
  scope: z.enum(["repeat", "once"]),
  period: CardSchema.shape.capPeriod,
  anchor: z.union([date, z.enum(["today", "tomorrow", "next_period"])]).nullable(),
};
const schedule = z.strictObject({
  day: z.union([date, z.enum(["today", "tomorrow", "anchor"]), z.int().min(1).max(31)]),
  time: time.nullable(),
});
const reward = z.int().min(0).max(rules.dailyExperience);

const meter = z.strictObject({
  action: z.enum(["create", "edit", "delete"]),
  target: name,
  newName: name.nullable(),
  unit: z.string().max(textLimits.unit).nullable(),
  value: meterValue.nullable(),
  valueMode: z.enum(["set", "add"]),
  min: limit,
  max: limit,
});
const plan = z.strictObject({
  ...planScope,
  action: z.enum(["set_card", "remove_card", "add_slot", "edit_slot", "remove_slot", "settings"]),
  cardName: name.nullable(),
  uses: z.int().min(planRules.minUses).max(planRules.maxUses).nullable(),
  score: z.int().min(planRules.minScore).max(planRules.maxScore).nullable(),
  schedule: schedule.nullable(),
  existing: schedule.nullable(),
  mode: z.enum(["cards", "score"]).nullable(),
  timeline: z.boolean().nullable(),
  targetScore: z.int().min(planRules.minTarget).max(planRules.maxTarget).nullable(),
});
const attribute = z.strictObject({
  action: z.enum(["create", "place", "move"]),
  name,
  initial: z.int().min(0).max(attributeRules.maxLevel).multipleOf(10).nullable(),
  slot: z.int().min(1).max(attributeRules.totalSlots).nullable(),
});
const card = z.strictObject({
  action: z.enum(["favorite", "unfavorite", "reorder_favorite", "template", "use_template", "copy", "abandon", "archive", "restore", "reset", "delete"]),
  cardName: name,
  beforeCardName: name.nullable(),
});
const advancedCard = z.strictObject({
  cardName: name,
  life: CardSchema.shape.life.nullable(),
  uses: CardSchema.shape.uses.nullable(),
  cap: CardSchema.shape.cap.nullable(),
  capPeriod: CardSchema.shape.capPeriod.nullable(),
  score: CardSchema.shape.score.nullable(),
  evaluate: z.boolean().nullable(),
  settle: z.boolean().nullable(),
  timeMode: CardSchema.shape.timeMode.nullable(),
  timeWindows: z.array(z.strictObject({ start: time, end: time })).max(100).nullable(),
  rewards: z.array(z.strictObject({ name, amount: reward })).max(attributeRules.totalSlots).nullable(),
  effects: z.array(z.strictObject({ id: z.enum(statusKeys), amount: z.int().min(-statusRules.max).max(statusRules.max) })).max(statusKeys.length).nullable(),
  values: z.array(z.strictObject({ name, amount: z.int().min(-1e12).max(1e12) })).max(100).nullable(),
  replaceLists: z.boolean(),
  rest: z.boolean().nullable(),
  sleep: z.boolean().nullable(),
});
const journal = z.strictObject({
  action: z.enum(["replace_note", "clear_note", "delete_entry"]),
  cardName: name.nullable(),
  date: date.nullable(),
  note: z.string().trim().min(1).max(textLimits.note).nullable(),
});
const timer = z.strictObject({
  action: z.enum(["pause", "resume", "cancel", "set_quantity"]),
  cardName: name.nullable(),
  quantity: z.int().min(1).max(actionRules.maxQuantity).nullable(),
});
const preferences = z.strictObject({
  planMode: z.enum(["cards", "score"]).nullable(),
  earlyCompletion: z.enum(["ask", "count", "record"]).nullable(),
  rewardPerUnitMax: reward.min(1).nullable(),
  rewardTotalMax: reward.min(1).nullable(),
});
const appearance = z.strictObject({
  action: z.enum(["theme", "floating", "lighting"]),
  themeName: name.nullable(),
  enabled: z.boolean().nullable(),
});

export const aiManagementTools = [
  { name: "manage_meter", schema: meter,
    description: "Create, edit, adjust or delete a custom numeric meter. For create target is the new name. For edit/delete target is the exact existing name. Null keeps a field unchanged, except min/max mode clear removes that bound (value null). Use add for an explicit signed increment. Ask if a target or amount is unclear. The app opens its editor or deletion confirmation." },
  { name: "manage_plan", schema: plan,
    description: "Edit the normal calendar plan. Recurring plans use repeat and anchor=null. One-time plans use once, a day/week/month period and an explicit ISO date, today, tomorrow, or next_period. Ask when scope/period is unclear. set_card adds or sets a card's target count (uses) or points per use (score). remove_card removes it and its slots. add_slot sets a schedule; edit_slot and remove_slot require the old slot's day and time in existing. For once, use ISO date, today, tomorrow, or anchor (same date as selected). For repeat, use 1 for daily, ISO weekday 1–7 for weekly, or day 1–31 for monthly. Null time means all-day. settings changes the selected plan's mode, timeline or overall targetScore in points mode. Set unused fields to null. The user confirms locally." },
  { name: "manage_attribute", schema: attribute,
    description: "Create a custom attribute in the library, place an inactive attribute, or move an active attribute to another slot. Use the exact attribute name or built-in ID. A new attribute needs an explicitly chosen initial level in steps of ten; slot is null to save it in the library. Place/move require a slot number from 1 to 6 and initial=null. Follow the local app's slot availability and confirmation." },
  { name: "manage_card", schema: card,
    description: "Favorite, unfavorite, reorder a favorite, copy, save as template (template), create a card from an existing template (use_template), abandon, archive, restore, restore and reset stats, or delete a card. Use its exact name, and beforeCardName only when reordering; null places it last. Preserve the local confirmation and never use delete for abandon or archive." },
  { name: "edit_card_rules", schema: advancedCard,
    description: "Prefill the normal card editor for advanced settings: lifetime and uses, check-in cap, plan points, evaluation, settlement, allowed time windows, attribute rewards, status effects, custom-meter changes, rest or sleep. Null keeps the field. For rewards, effects and values, set replaceLists=false for ordinary edits, keeping unmentioned entries, and use amount=0 to remove one entry. Use replaceLists=true only for explicit replacement of a whole list (empty clears it). timeWindows always replaces that whole list. For rewards and values use exact existing attribute or meter names (built-in attribute IDs also work). The user reviews and saves." },
  { name: "manage_journal", schema: journal,
    description: "Replace or clear the reflection on one journal entry, or delete one check-in with its normal rollback confirmation. Use card name and date where specified; null for both only when the user explicitly means the latest entry. For replace_note copy a verbatim excerpt of the latest user message. Otherwise note=null. Use append_journal_note to add to an existing note." },
  { name: "manage_timer", schema: timer,
    description: "Pause, resume or cancel one unfinished action, or set its in-progress quantity. Use cardName=null only if the user explicitly means their current action; otherwise copy its name. Include quantity only for set_quantity. Cancel requires confirmation. Use record_card for finishing an action." },
  { name: "edit_preferences", schema: preferences,
    description: "Change app-wide action/plan preferences when explicitly asked. planMode switches the global completion mode (use manage_plan for a single plan). earlyCompletion chooses what happens before a timed target: ask, count as a completion, or record effort only. Reward limits change the card editor's slider bounds only. Null keeps each field unchanged. The user confirms locally." },
  { name: "edit_appearance", schema: appearance,
    description: "Change one local visual setting explicitly requested by the user: theme (exact theme name or ID in themeName, enabled=null), card floating or card lighting (enabled=true/false and themeName=null). Ask if the setting or target is unclear. The app confirms and checks theme access locally." },
] as const;

export const aiManagementOperation = z.discriminatedUnion("type", [
  meter.extend({ type: z.literal("manage_meter") }),
  plan.extend({ type: z.literal("manage_plan") }),
  attribute.extend({ type: z.literal("manage_attribute") }),
  card.extend({ type: z.literal("manage_card") }),
  advancedCard.extend({ type: z.literal("edit_card_rules") }),
  journal.extend({ type: z.literal("manage_journal") }),
  timer.extend({ type: z.literal("manage_timer") }),
  preferences.extend({ type: z.literal("edit_preferences") }),
  appearance.extend({ type: z.literal("edit_appearance") }),
]);
export type AiManagementOperation = z.infer<typeof aiManagementOperation>;
