import { profileDraftSlot } from "./registered-storage";
import { currentDraftEpoch } from "./draft-epoch";

export type ProfileDraft = {
  step: number;
  name: string;
  age: number;
  values: number[];
  add: boolean;
};

/** The original onboarding format, including its attribute-count validation. */
export function readProfileDraft(
  createdAt: number,
  attributeCount: number,
): ProfileDraft | null {
  try {
    const v = JSON.parse(profileDraftSlot(createdAt).read().value || "null");
    if (
      v &&
      Number.isInteger(v.step) &&
      v.step >= 0 &&
      v.step <= 6 &&
      typeof v.name === "string" &&
      v.name.length <= 30 &&
      Number.isInteger(v.age) &&
      v.age >= 1 &&
      v.age <= 120 &&
      Array.isArray(v.values) &&
      v.values.length === attributeCount &&
      v.values.every(
        (n: unknown) =>
          typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100,
      ) &&
      typeof v.add === "boolean"
    )
      return v;
  } catch {}
  return null;
}

export function writeProfileDraft(createdAt: number, draft: ProfileDraft, epoch = currentDraftEpoch()) {
  if (epoch !== currentDraftEpoch()) return "unavailable" as const;
  try {
    return profileDraftSlot(createdAt).write(JSON.stringify(draft));
  } catch {
    return "unavailable" as const;
  }
}

export function removeProfileDraft(createdAt: number, epoch = currentDraftEpoch()) {
  if (epoch !== currentDraftEpoch()) return "unavailable" as const;
  return profileDraftSlot(createdAt).remove();
}
