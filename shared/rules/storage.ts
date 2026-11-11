import { attributeRules } from "./growth.ts";
import { planRules } from "./plans.ts";

/** Existing schema limits, also checked before packed rows expand into objects. */
export const saveCollectionLimits = {
  cards: 10000,
  cardTemplates: 1000,
  attributes: attributeRules.libraryLimit,
  meters: 500,
  actions: 100,
  entries: 100000,
  plans: planRules.maxPlans,
  days: 50000,
  planCycles: 50000,
  messages: 100000,
  changes: 100000,
} as const;

/** Existing persistence policy; changing these limits is separate from a schema upgrade. */
export const storageRules = {
  maxImportBytes: 64 * 1024 * 1024,
  dailyBackupCount: 7,
  exportReminderMs: 7 * 86400000,
} as const;

/** Technical budgets, not product rewards or historical conversion values. */
export const storageIO = {
  base64ChunkBytes: 8192,
  downloadUrlLifetimeMs: 1000,
} as const;

export const cloudTiming = {
  saveDebounceMs: 800,
  pollMs: 30000,
  retryMs: 300,
} as const;
