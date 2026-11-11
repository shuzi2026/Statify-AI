import { useEffect, useRef } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { planPeriodLabel } from "../plan-labels";
import { uiLocale } from "../i18n/runtime";
import { DateInput } from "../inputs/ValueInputs";
import { firstAvailableDate, newPlan } from "../planning";
import type { Plan } from "../model";
import type { Selection } from "./types";
export function PlanSelection({
  selection,
  select,
  p,
  now,
  toggleTimeline,
}: {
  selection: Selection;
  select: (value: Selection) => void;
  p: Plan;
  now: number;
  toggleTimeline: (enabled: boolean) => void;
}) {
  return (
    <div className="plan-selectors" onPointerDown={(e) => e.stopPropagation()}>
      <select
        aria-label="计划范围"
        value={selection.scope}
        onChange={(e) =>
          select({
            ...selection,
            scope: e.currentTarget.value as Selection["scope"],
            anchor: firstAvailableDate(selection.period, now),
          })
        }
      >
        <option value="repeat">周期计划</option>
        <option value="once">指定日期计划</option>
      </select>
      {selection.scope === "repeat" ? (
        <select
          aria-label="周期"
          value={selection.period}
          onChange={(e) => {
            const period = e.currentTarget.value as Plan["period"];
            select({
              ...selection,
              period,
              anchor: firstAvailableDate(period, now),
            });
          }}
        >
          <option value="day">每日</option>
          <option value="week">每周</option>
          <option value="month">每月</option>
        </select>
      ) : (
        <DateChoice selection={selection} change={select} now={now} />
      )}
      <label className="plan-timeline-toggle">
        <input
          type="checkbox"
          aria-label="时间轴"
          checked={!!p.timeline}
          onChange={(e) => toggleTimeline(e.currentTarget.checked)}
        />
        时间轴
      </label>
    </div>
  );
}
function DateChoice({
  selection,
  change,
  now,
}: {
  selection: Selection;
  change: (value: Selection) => void;
  now: number;
}) {
  const ref = useRef<HTMLDetailsElement>(null),
    root = useRef<HTMLDivElement>(null),
    p = { ...newPlan(now), ...selection };
  useEffect(() => {
    const outside = (e: globalThis.PointerEvent) => {
      if (ref.current && !root.current?.contains(e.target as Node))
        ref.current.open = false;
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, []);
  return (
    <div ref={root} className="plan-date-choice">
      <details ref={ref}>
        <summary aria-label="选择计划日期">
          <CalendarDays size={13} />
          <span>{planPeriodLabel(p, now)}</span>
          <ChevronDown size={12} />
        </summary>
        <div className="plan-date-menu">
          <div role="group" aria-label="指定日期周期">
            {(["day", "week", "month"] as const).map((period, index) => (
              <button
                key={period}
                type="button"
                aria-pressed={selection.period === period}
                onClick={() => change({ ...selection, period })}
              >
                {
                  (uiLocale ? ["Day", "Week", "Month"] : ["日", "周", "月"])[
                    index
                  ]
                }
              </button>
            ))}
          </div>
          <DateInput
            aria-label="计划日期"
            value={selection.anchor}
            onChange={(e) => {
              if (!e.currentTarget.value) return;
              change({ ...selection, anchor: e.currentTarget.value });
              if (ref.current) ref.current.open = false;
            }}
          />
        </div>
      </details>
    </div>
  );
}
