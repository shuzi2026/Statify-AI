import { Bell } from "lucide-react";
import { useRef, useState } from "react";
import { Dialog } from "./components";
import { execution } from "./engine";
import { type State } from "./model";
import {
  bounds,
  dailyPlanProgress,
  executionPlan,
  todayPlanTodo,
} from "./planning";
import { PlanTodo } from "./plans/PlanTodo";
export function ExecutionHUD({
  s,
  now,
  level,
  showMonth = false,
}: {
  s: State;
  now: number;
  level: number;
  showMonth?: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null),
    close = () => {
      Expand(false);
      queueMicrotask(() => trigger.current?.focus({ preventScroll: true }));
    };
  const [expanded, Expand] = useState(false),
    day = executionPlan(s, "day", now),
    week = executionPlan(s, "week", now),
    month = executionPlan(s, "month", now),
    grades = execution(s, now).byPeriod;
  const bar = (
    label: string,
    name: string,
    plan: ReturnType<typeof executionPlan>,
  ) => {
    const p = plan?.progress;
    return (
      <span className="execution-track">
        <span>{label}</span>
        <progress
          aria-label={name}
          max={p?.target || 1}
          value={p?.value || 0}
        />
        <small>{p ? p.value + " / " + p.target : "--"}</small>
      </span>
    );
  };
  const periods = [
    {
      period: "day",
      label: "每日",
      name: "每日任务进度",
      p: day,
      rule: "达到今日目标立即升1级。",
      once: "当前依据：今日计划",
      repeat: "当前依据：每日重复计划",
      time: "有今日计划时，只按今日计划计算，不计每日重复计划。进度次日重置。",
    },
    {
      period: "week",
      label: "每周",
      name: "每周任务进度",
      p: week,
      rule: "达到本周目标立即升3级。",
      once: "当前依据：本周计划",
      repeat: "当前依据：每周重复计划",
      time: "有本周计划时，只按本周计划计算，不计每周重复计划。进度下周一重置。",
    },
    {
      period: "month",
      label: "每月",
      name: "每月任务进度",
      p: month,
      rule: "达到本月目标立即升5级。",
      once: "当前依据：本月计划",
      repeat: "当前依据：每月重复计划",
      time: "有本月计划时，只按本月计划计算，不计每月重复计划。进度下月1日重置。",
    },
  ] as const;
  return (
    <div className="execution-block">
      <button
        ref={trigger}
        className="execution-hud execution-summary"
        aria-label={"执行等级" + level + "，查看执行等级详情"}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        onClick={() => Expand(true)}
      >
        <span>执行等级</span>
        <strong>
          <small>Lv.</small>
          {level}
        </strong>
        {bar("每日", "今日执行进度", day)}
        {bar("每周", "本周执行进度", week)}
        {showMonth && bar("每月", "本月执行进度", month)}
      </button>
      {expanded && (
        <Dialog title="执行等级" className="execution-details" close={close}>
          <div className="execution-total">
            <span>当前执行等级</span>
            <strong>Lv. {level}</strong>
          </div>
          {periods.map((item) => (
            <section
              className="execution-period"
              aria-label={item.label + "执行等级"}
              key={item.period}
            >
              <header>
                <h3>{item.label}任务</h3>
                <span>Lv. {grades[item.period]}</span>
              </header>
              {bar(item.label, item.name, item.p)}
              <p className="execution-reward-rule">{item.rule}</p>
              {item.p && (
                <p className="execution-settlement-rule">
                  {item.p.scope === "once" ? item.once : item.repeat}
                </p>
              )}
              <p className="execution-settlement-rule">{item.time}</p>
            </section>
          ))}
          <p className="execution-settlement-rule">
            每个周期只奖励一次。调整本期有效目标后，等级随达标状态重新计算；历史周期保留。
          </p>
        </Dialog>
      )}
    </div>
  );
}
export function PlanBell({
  s,
  now,
  progress,
  open,
}: {
  s: State;
  now: number;
  progress: ReturnType<typeof dailyPlanProgress>;
  open: () => void;
}) {
  const day = bounds("day", now);
  const pending = s.messages.filter(
    (m) => !m.read && m.dueAt >= day.start && m.dueAt < day.end,
  );
  const visible = pending.length
    ? todayPlanTodo(s, now, progress).messageIds
    : null;
  const unread = pending.filter((m) => visible?.has(m.id)).length;
  return (
    <button
      className="plan-message-bell icon-button"
      aria-label={unread ? `今日待办，${unread}条未读提醒` : "今日待办"}
      aria-haspopup="dialog"
      onClick={open}
    >
      <Bell size={18} />
      {unread > 0 && <span>{unread > 99 ? "99+" : unread}</span>}
    </button>
  );
}
export function PlanMessages({
  s,
  now,
  progress,
  saving,
  close,
  read,
  start,
}: {
  s: State;
  now: number;
  progress: ReturnType<typeof dailyPlanProgress>;
  saving: boolean;
  close: () => void;
  read: (ids: ReadonlySet<string>) => void;
  start: (id: string) => void;
}) {
  const { tasks, messageIds } = todayPlanTodo(s, now, progress);
  return (
    <Dialog
      title="今日待办"
      className="plan-messages"
      focusTitle
      close={() => {
        const unread = new Set(
          s.messages
            .filter((m) => !m.read && messageIds.has(m.id))
            .map((m) => m.id),
        );
        close();
        if (unread.size) read(unread);
      }}
    >
      <PlanTodo s={s} now={now} tasks={tasks} saving={saving} start={start} />
    </Dialog>
  );
}
