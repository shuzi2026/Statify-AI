/** Existing gameplay defaults; extracting these does not alter historical snapshots.
 * dailyExperience: experience points/day; trialDays: days (not server authorization).
 */
export const rules = { dailyExperience: 1000, trialDays: 7 };
export const ratings = [0.75, 0.85, 1, 1.15, 1.25];
/** Reward amounts per unit and per settlement; user preferences may override them. */
export const defaultPreferences = {
  earlyCompletion: "ask" as const,
  rewardPerUnitMax: 100,
  rewardTotalMax: 1000,
};
export const initialValues = {
  attributeLevel: 50,
  statusBase: 50,
  profileAge: 25,
  cardMinutes: 25,
  cardScore: 1,
  cardUses: 1,
} as const;

/** Attribute levels/slots and experience points. Curve formula remains in engine.threshold. */
export const attributeRules = {
  maxLevel: 100,
  initialAdjustmentWindowMs: 72 * 60 * 60 * 1000,
  freeSlots: 4,
  totalSlots: 6,
  libraryLimit: 500,
};
export const growthCurve = {
  bandSize: 10,
  initialThreshold: 500,
  firstBandRise: 600,
  peakBase: 1000,
  peakStep: 50,
  troughRatio: 0.6,
  power: 2,
};
