import type { Plan } from "../../shared/save-schema";
import { bounds } from "../../src/planning";
/** Regression time point only. Execution rewards no longer wait for this time. */
export function formerCutoff(period: Plan["period"], at: number) {
  const date = new Date(bounds(period, at).end);
  date.setHours(date.getHours() - 1);
  return date.getTime();
}
