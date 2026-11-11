/** Execution levels per completed calendar period, never per action. */
export const planReward = { day: 1, week: 3, month: 5 };
export const planRules = {
  lateEditHour: 23,
  choiceMemoryMs: 30 * 60 * 1000,
  liveReminderMs: 60 * 1000,
  minUses: 1,
  maxUses: 10000,
  minScore: 0,
  maxScore: 3,
  minTarget: 1,
  maxTarget: 30000000,
  maxPlans: 500,
  maxRequirements: 1000,
  maxSlots: 1000,
  maxSlotMinutes: 1440,
  defaultTarget: 1,
  defaultItemScore: 1,
  legacyDailyTarget: 7,
};
/** Finite traversal guards, not player reward targets. */
export const planSafetyLimits = {
  cycleIterations: 50000,
  occupancyIterations: 371,
};

/** Shared by input validation and commands; strings/NaN/fractions never count. */
export const validPlanUses = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= planRules.minUses &&
  value <= planRules.maxUses;
export const validPlanScore = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= planRules.minScore &&
  value <= planRules.maxScore;
