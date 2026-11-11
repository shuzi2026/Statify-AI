import { useCallback, useEffect, useState } from "react";
import { statusKeys, type State } from "../model";
import { statusValue } from "../engine";
import { planMessages } from "../planning";
import { accountTrialActive, memberActive } from "../payments/access";
import { observeViewClock } from "./view-clock";
import { attributeRules } from "../../shared/rules/growth";

function useViewTime(
  read: (now: number) => readonly unknown[],
  enabled = true,
) {
  const [, changed] = useState(Date.now);
  useEffect(() => {
    if (enabled) return observeViewClock({ read, changed });
  }, [read, enabled]);
  // A save or UI action renders with current time immediately, not the last tick.
  return Date.now();
}
const second = (now: number) => [Math.floor(now / 1000)];
export const useActionTime = (running: boolean) => useViewTime(second, running);

export function useAppTime(
  s: State | null,
  initialAdjustmentUntil: number | null | undefined,
) {
  const read = useCallback(
    (now: number) => {
      const reminders = s ? planMessages(s, now) : null;
      return [
        Math.floor(now / 60000),
        memberActive(now),
        accountTrialActive(now),
        !!s && s.restUntil > now,
        !!s && now > s.createdAt + attributeRules.initialAdjustmentWindowMs,
        (initialAdjustmentUntil || 0) > now,
        ...statusKeys.map((key) => (s ? statusValue(s, key, now) : null)),
        reminders?.notices.length,
        ...(reminders?.notices.map((message) => message.id) ?? []),
        reminders?.live.length,
        ...(reminders?.live.map((message) => message.id) ?? []),
      ];
    },
    [s, initialAdjustmentUntil],
  );
  return useViewTime(read);
}
