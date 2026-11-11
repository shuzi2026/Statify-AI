import type { RuleContext } from "../rules/context";
import { previewMemberActive } from "./preview-access";
/** Runtime-only authorization. Never serialized with, or read from, player saves. */
export type Adjustment = {
  request_id: string;
  save_created_at: number;
  values: { id: string; initial: number }[];
};
export type Entitlement = {
  member: boolean;
  member_ends_at?: number | null;
  trial_ends_at: number | null;
  trial_available: boolean;
  initial_adjustment_until: number | null;
  initial_adjustment: Adjustment | null;
  valid_until: number;
};
let entitlement: Entitlement | null = null;
const listeners = new Set<() => void>();
export const subscribeAccess = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function acceptEntitlement(value: Entitlement | null) {
  entitlement = value;
  for (const listener of listeners) listener();
}
export const memberActive = (now = Date.now()) =>
  previewMemberActive() ||
  (!!entitlement?.member &&
    entitlement.valid_until > now &&
    (entitlement.member_ends_at == null || entitlement.member_ends_at > now));
export const accountTrialActive = (now = Date.now()) =>
  !!entitlement &&
  entitlement.valid_until > now &&
  (entitlement.trial_ends_at || 0) > now;
/** Shared premium features include a verified active trial; paid-only slot rules stay separate. */
export const memberFeaturesActive = (now = Date.now()) =>
  memberActive(now) || accountTrialActive(now);

/** Capture at the operation boundary, including re-checks inside save transactions. */
export function ruleContext(now = Date.now()): RuleContext {
  return { now, member: memberActive(now), trial: accountTrialActive(now) };
}
