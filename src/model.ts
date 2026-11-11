import { statusKeys, type State, type Card } from "../shared/save-schema";
import { defaultPreferences, initialValues } from "../shared/rules/growth";
import { starterCardDefinitions } from "./rules/starter-cards";

export * from "../shared/save-schema";
export const uid = () => crypto.randomUUID();
export const methodNames = {
  instant: "即时打卡",
  duration: "固定时长",
  timed: "按时长",
  quantity: "按数量",
};
export { ratings, rules } from "../shared/rules/growth";
export const ratingNames = [
  "效果不理想",
  "还差一点",
  "稳稳完成",
  "状态在线",
  "效率拉满！",
];
export function newCard(now: number): Card {
  return {
    id: uid(),
    name: "",
    message: "",
    customArt: "",
    artwork: "auto",
    description: "",
    method: "instant",
    minutes: initialValues.cardMinutes,
    unit: "个",
    category: "",
    favorite: false,
    order: now,
    createdAt: now,
    life: "repeat",
    uses: initialValues.cardUses,
    count: 0,
    state: "active",
    evaluate: false,
    settle: true,
    score: initialValues.cardScore,
    cap: 0,
    capPeriod: "day",
    timeStart: "",
    timeEnd: "",
    timeWindows: [],
    timeMode: "block",
    rewards: [],
    effects: [],
    values: [],
    sleep: false,
    rest: false,
    statsSince: 0,
    changes: [],
  };
}
export function fresh(now: number, region: State["region"]): State {
  const attrs = ["体魄", "记忆", "认知", "专注"].map((name, i) => ({
    id: ["attr-body", "attr-mem", "attr-know", "attr-foc"][i],
    name,
    initial: initialValues.attributeLevel,
    earned: 0,
    slot: i,
    daily: {},
    original: true,
  }));
  const s: State = {
    version: "0.2.2",
    preferences: { ...defaultPreferences },
    region,
    planMode: "cards",
    createdAt: now,
    profile: { name: "朋友", age: initialValues.profileAge, onboarded: false },
    homeTourPending: false,
    firstActionGuide: false,
    cards: [],
    cardTemplates: [],
    attributes: attrs,
    meters: [],
    states: Object.fromEntries(
      statusKeys.map((k) => [
        k,
        { base: initialValues.statusBase, offset: 0, expires: 0 },
      ]),
    ) as State["states"],
    sleepCycle: "",
    restUntil: 0,
    actions: [],
    entries: [],
    plans: [],
    days: [],
    dailyPlan: "",
    planCycles: [],
    messages: [],
    changes: [],
    trialStarted: null,
    initialEdited: false,
    slotChanges: {},
    legacy: null,
    migrationNotice: false,
    categories: ["生活", "学习", "工作", "运动"],
  };
  return s;
}
export function templates(now: number): Card[] {
  const defs = starterCardDefinitions();
  return defs.map((d) => ({ ...newCard(now), ...d }));
}
