import {
  readPreference,
  writePreference,
  type Preferences,
} from "./preferences";
import type { PreferenceRead } from "./preference-repository";
type Values = {
  reducedEffects: boolean;
  cardFloating: boolean;
  planSplit: number;
  planSplitManual: boolean;
};
export function readDevicePreference<K extends keyof Values>(
  key: K,
): PreferenceRead<Values[K]> {
  if (key === "planSplit" || key === "planSplitManual") {
    const result = readPreference("planLayout");
    return {
      status: result.status,
      value: result.value[
        key === "planSplit" ? "ratio" : "manual"
      ] as Values[K],
    };
  }
  return readPreference(key) as PreferenceRead<Values[K]>;
}
export const writeDevicePreference = <
  K extends "reducedEffects" | "cardFloating",
>(
  key: K,
  value: Values[K],
) => writePreference(key, value);
/** Ratio and its manual flag are one value and one transaction. */
export const writePlanLayout = (value: Preferences["planLayout"]) =>
  writePreference("planLayout", value);
