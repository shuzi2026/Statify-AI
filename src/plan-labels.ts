import { planBounds, planDate, periodLabel } from "./planning";
import type { Plan } from "./model";
export function slotLabel(
  p: Plan,
  slot: NonNullable<Plan["slots"]>[number],
  locale: "en" | undefined,
) {
  const period =
    locale === "en"
      ? ({ day: "Today", week: "This week", month: "This month" } as const)[
          p.period
        ]
      : ({ day: "本日", week: "本周", month: "本月" } as const)[p.period];
  if (slot.configured === false || !slot.day) return period;
  if (locale === "en") {
    const day =
      p.scope === "once"
        ? new Date(slot.day + "T12:00:00").toLocaleDateString("en", {
            month: "short",
            day: "numeric",
          })
        : p.period === "week"
          ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][
              Number(slot.day) - 1
            ]
          : p.period === "month"
            ? "Day " + slot.day + " of each month"
            : "";
    return [day, slot.time].filter(Boolean).join(" ") || period;
  }
  const day =
    p.scope === "once"
      ? slot.day.slice(5).replace("-", "月") + "日"
      : p.period === "week"
        ? ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][
            Number(slot.day) - 1
          ]
        : p.period === "month"
          ? `每月${slot.day}日`
          : "";
  return [day, slot.time].filter(Boolean).join(" ") || period;
}
export function planPeriodLabel(p: Plan, now: number) {
  if (p.scope !== "once") return periodLabel[p.period];
  const b = planBounds(p, now);
  return p.period === "day"
    ? planDate(b.start)
    : p.period === "month"
      ? b.key
      : `${planDate(b.start)}～${planDate(b.end - 1)}`;
}
