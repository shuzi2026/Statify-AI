import { actionRules } from "./rules/actions.ts";
import { saveCollectionLimits } from "./rules/storage.ts";
import { planRules } from "./rules/plans.ts";
import { statusRules } from "./rules/status.ts";
import { textLimits } from "./rules/text.ts";
import { defaultPreferences, attributeRules } from "./rules/growth.ts";
import { z } from "zod";
import { shoppingCardProduct, shoppingProductUrl } from "./shopping-demo.ts";
const num = z.number().finite().min(-1e12).max(1e12);
const stamp = z.number().int().min(0).max(8640000000000000);
const text = z.string().max(200),
  id = z.string().min(1).max(100);
export const statusKeys = [
  "mood",
  "vitality",
  "stress",
  "comfort",
  "sleep",
] as const;
export const statusNames = {
  mood: "情绪",
  vitality: "活力",
  stress: "压力",
  comfort: "身体舒适度",
  sleep: "睡眠",
};
export const Method = z.enum(["instant", "duration", "timed", "quantity"]);
const effect = z.object({ id, amount: num });
export const CardSchema = z.object({
  id,
  name: text.min(1),
  shopping: shoppingCardProduct.optional(),
  message: z.string().max(textLimits.message).default(""),
  customArt: z
    .string()
    .max(1500000)
    .regex(/^$|^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
    .default(""),
  artwork: z
    .enum([
      "auto",
      "companion",
      "reading",
      "writing",
      "drinking",
      "walking",
      "sleeping",
    ])
    .default("auto"),
  description: z.string().max(2000).default(""),
  method: Method,
  minutes: num.min(1).max(actionRules.maxTargetMinutes),
  unit: text,
  category: text,
  favorite: z.boolean(),
  order: stamp,
  createdAt: stamp,
  archiveBaseName: text.optional(),
  life: z.enum(["repeat", "consumable"]),
  uses: num.int().min(1),
  count: num.int().min(0),
  state: z.enum(["active", "abandoned", "archived"]),
  evaluate: z.boolean(),
  settle: z.boolean(),
  score: num.int().min(planRules.minScore).max(planRules.maxScore),
  cap: num.int().min(0),
  capPeriod: z.enum(["day", "week", "month"]),
  timeStart: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/),
  timeEnd: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/),
  timeWindows: z
    .array(
      z.object({
        start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      }),
    )
    .max(100)
    .default([]),
  timeMode: z.enum(["block", "hint"]),
  rewards: z.array(effect).max(6),
  effects: z.array(effect).max(5),
  values: z.array(effect).max(100),
  sleep: z.boolean(),
  rest: z.boolean(),
  statsSince: stamp.default(0),
  changes: z
    .array(z.object({ at: stamp, description: text }))
    .max(10000)
    .default([]),
});
export type Card = z.infer<typeof CardSchema>;
const attr = z.object({
  id,
  name: text,
  initial: num.min(0).max(attributeRules.maxLevel),
  earned: num.min(0),
  slot: z
    .number()
    .int()
    .min(-1)
    .max(attributeRules.totalSlots - 1),
  daily: z.record(z.string(), num.min(0)),
  original: z.boolean(),
});
const meter = z.object({
  id,
  name: text.min(1),
  unit: text,
  value: num,
  precision: z.number().int().min(0).max(2),
  min: num.nullable(),
  max: num.nullable(),
});
export type Meter = z.infer<typeof meter>;
export const planRequirement = z.object({
  id,
  target: num.int().min(planRules.minUses).max(planRules.maxUses),
  score: num.int().min(planRules.minScore).max(planRules.maxScore).optional(),
});
export const planSlot = z.object({
  id,
  cardId: id,
  day: z.string().max(10),
  time: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/),
  minutes: num.int().min(0).max(planRules.maxSlotMinutes),
  configured: z.boolean().optional(),
});
export const PlanSchema = z.object({
  id,
  name: text,
  period: z.enum(["day", "week", "month"]),
  mode: z.enum(["score", "cards"]),
  target: num.int().min(planRules.minTarget).max(planRules.maxTarget),
  cards: z.array(planRequirement).max(planRules.maxRequirements),
  active: z.boolean(),
  createdAt: stamp,
  scope: z.enum(["repeat", "once"]).optional(),
  anchor: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  startsAt: stamp.optional(),
  draft: z.boolean().optional(),
  timeline: z.boolean().optional(),
  slots: z.array(planSlot).max(planRules.maxSlots).optional(),
});
const plan = PlanSchema;
export type Plan = z.infer<typeof plan>;
const planCycle = z.object({
  id,
  planId: id,
  key: text,
  start: stamp,
  end: stamp,
  startsAt: stamp,
  mode: z.enum(["score", "cards"]),
  target: num.int().min(1),
  cards: z.array(planRequirement),
  scope: z.enum(["repeat", "once"]),
  period: z.enum(["day", "week", "month"]),
  timeline: z.boolean().optional(),
  slots: z.array(planSlot).optional(),
  doneAt: stamp.optional(),
});
export type PlanCycle = z.infer<typeof planCycle>;
const message = z.object({
  id,
  planId: id,
  slotId: id,
  cardId: id,
  name: text,
  dueAt: stamp,
  kind: z.enum(["scheduled", "date"]),
  read: z.boolean(),
});
export type PlanMessage = z.infer<typeof message>;
const status = z.object({
  base: num.min(statusRules.min).max(statusRules.max),
  offset: num,
  expires: stamp,
});
const statuses = z.object({
  mood: status,
  vitality: status,
  stress: status,
  comfort: status,
  sleep: status,
});
const action = z.object({
  id,
  card: CardSchema,
  startedAt: stamp,
  elapsed: num.min(0),
  runningSince: stamp.nullable(),
  endedAt: stamp.nullable(),
  reported: z.literal(true).optional(),
  status: z.record(z.string(), num),
  coefficient: num.min(0.8).max(1.2),
  plans: z.array(id),
  draft: z
    .object({
      seconds: num.min(0),
      quantity: num.min(0),
      rating: num,
      counted: z.boolean().nullable(),
      note: z.string().max(textLimits.note),
    })
    .optional(),
});
export type Action = z.infer<typeof action>;
const result = z.object({
  id,
  name: text,
  before: num,
  after: num,
  requested: num,
  actual: num,
  applied: num.optional(),
  reason: text.default(""),
});
const entry = z.object({
  purchase: shoppingCardProduct.shape.lastPurchase.unwrap().extend({ url: shoppingProductUrl, title: text.optional() }).optional(),
  id,
  cardId: id,
  name: text,
  method: Method,
  startedAt: stamp,
  endedAt: stamp,
  date: text,
  seconds: num.min(0),
  measured: num.min(0),
  reported: z.literal(true).optional(),
  quantity: num.min(0),
  counted: z.boolean(),
  rating: num.min(0.75).max(1.25),
  coefficient: num,
  note: z.string().max(textLimits.note),
  score: num,
  plans: z.array(id),
  rewards: z.array(result),
  effects: z.array(result),
  values: z.array(result),
  legacy: z.boolean().default(false),
});
export type Entry = z.infer<typeof entry>;
const day = z.object({
  date: text,
  target: num,
  mode: z.enum(["score", "cards"]),
  requirements: z.array(z.object({ id, target: num })),
  planId: text,
  enabled: z.boolean(),
});
export const StateSchema = z.object({
  version: z.enum(["0.2.1", "0.2.2"]).transform(() => "0.2.2" as const),
  preferences: z
    .object({
      earlyCompletion: z
        .enum(["ask", "count", "record"])
        .default(defaultPreferences.earlyCompletion),
      rewardPerUnitMax: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(defaultPreferences.rewardPerUnitMax),
      rewardTotalMax: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(defaultPreferences.rewardTotalMax),
    })
    .default(defaultPreferences),
  region: z.enum(["cn", "global"]).default("cn"),
  planMode: z.enum(["cards", "score"]).default("cards"),
  createdAt: stamp,
  profile: z.object({
    name: text,
    age: num.int().min(1).max(120),
    onboarded: z.boolean(),
  }),
  homeTourPending: z.boolean().default(false),
  firstActionGuide: z.boolean().default(false),
  cards: z.array(CardSchema).max(saveCollectionLimits.cards),
  cardTemplates: z
    .array(CardSchema)
    .max(saveCollectionLimits.cardTemplates)
    .default([]),
  attributes: z.array(attr).max(saveCollectionLimits.attributes),
  meters: z.array(meter).max(saveCollectionLimits.meters),
  states: statuses,
  sleepCycle: text,
  restUntil: stamp,
  actions: z.array(action).max(saveCollectionLimits.actions),
  entries: z.array(entry).max(saveCollectionLimits.entries),
  plans: z.array(plan).max(saveCollectionLimits.plans),
  days: z.array(day).max(saveCollectionLimits.days),
  dailyPlan: text,
  planCycles: z
    .array(planCycle)
    .max(saveCollectionLimits.planCycles)
    .default([]),
  messages: z.array(message).max(saveCollectionLimits.messages).default([]),
  changes: z
    .array(
      z.object({
        id,
        at: stamp,
        kind: text,
        name: text,
        objectId: id.optional(),
        before: num,
        after: num,
        note: z.string().max(2000),
      }),
    )
    .max(saveCollectionLimits.changes),
  trialStarted: stamp.nullable(),
  initialEdited: z.boolean(),
  slotChanges: z.record(z.string(), num),
  legacy: z.unknown().nullable(),
  migrationNotice: z.boolean(),
  categories: z.array(text).max(100),
});
export type State = z.infer<typeof StateSchema>;
