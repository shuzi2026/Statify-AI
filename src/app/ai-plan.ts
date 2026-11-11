import { planRules } from "../../shared/rules/plans";
import type { AiManagementOperation } from "../../shared/ai-management";
import type { Plan, State } from "../model";
import {
  bounds, configureBoardCard, findBoardPlan, firstAvailableDate, newPlan,
  planDate, putBoardCard, saveBoardPlan, updatePlanSlot, validDate,
} from "../planning";
import { CardConfirmation } from "../application/commands";
import { findAiCards } from "./ai-local-operation";

type Operation = Extract<AiManagementOperation, { type: "manage_plan" }>;
type Schedule = NonNullable<Operation["schedule"]>;

function tomorrow(now: number) {
  const date = new Date(now);
  date.setDate(date.getDate() + 1);
  return planDate(date.getTime());
}

function anchorDate(op: Operation, now: number) {
  if (op.scope === "repeat") return firstAvailableDate(op.period, now);
  if (op.anchor === "today") return planDate(now);
  if (op.anchor === "next_period") return planDate(bounds(op.period, now).end);
  if (op.anchor === "tomorrow") return tomorrow(now);
  if (!op.anchor || !validDate(op.anchor)) throw Error("请提供一次性计划的有效日期。");
  return op.anchor;
}

function slotSchedule(plan: Plan, slot: Schedule, anchor: string, requestedAt: number) {
  const day = slot.day === "anchor" ? anchor : slot.day === "today" ? planDate(requestedAt)
    : slot.day === "tomorrow" ? tomorrow(requestedAt) : slot.day;
  if (plan.scope === "once"
    ? typeof day !== "string" || !validDate(day)
    : typeof day !== "number" || day > { day: 1, week: 7, month: 31 }[plan.period])
    throw Error("时间安排的日期与计划周期不匹配。");
  return { day: String(day), time: slot.time ?? "" };
}

export function applyPlanOperation(
  state: State, op: Operation, now: number, confirmed: boolean, chinese: boolean, requestedAt = now,
) {
  const t = (zh: string, en: string) => chinese ? zh : en;
  const anchor = anchorDate(op, requestedAt);
  const stored = findBoardPlan(state, op.scope, op.period, anchor, now);
  const plan: Plan = structuredClone(stored ?? {
    ...newPlan(now), scope: op.scope, period: op.period, anchor, mode: state.planMode,
  });
  const period = { day: t("日", "daily"), week: t("周", "weekly"), month: t("月", "monthly") }[op.period];
  const cycle = bounds(op.period, new Date(anchor + "T00:00:00").getTime());
  const heading = op.scope === "repeat" ? t(`重复${period}计划`, `Recurring ${period} plan`) :
    t(`一次性${period}计划 · ${cycle.key}`, `One-time ${period} plan · ${cycle.key}`);
  const confirm = (details: string) => {
    if (!confirmed) throw new CardConfirmation(`${heading}\n\n${details}`, t("应用计划更改？", "Apply plan changes?"));
  };
  if (op.action === "settings") {
    if (op.mode === null && op.timeline === null && op.targetScore === null) throw Error("请指定要修改的计划设置。");
    if (op.mode !== null) plan.mode = op.mode;
    if (op.timeline !== null) plan.timeline = op.timeline;
    if (op.targetScore !== null) {
      const max = plan.cards.reduce((total, card) => total + card.target * (card.score ?? planRules.defaultItemScore), 0);
      if (plan.mode !== "score" || op.targetScore > max) throw Error("目标分数必须在积分模式下，且不能超过卡牌可获得的总分。");
      plan.target = op.targetScore;
    }
    confirm([
      op.mode !== null && (op.mode === "cards" ? t("按次数结算", "Complete by count") : t("按积分结算", "Complete by points")),
      op.timeline !== null && (op.timeline ? t("显示时间线", "Show timeline") : t("隐藏时间线", "Hide timeline")),
      op.targetScore !== null && t(`目标 ${op.targetScore} 分`, `Target: ${op.targetScore} points`),
    ].filter(Boolean).join(" · "));
    saveBoardPlan(state, plan, now);
    return;
  }
  const cards = op.cardName ? findAiCards(state.cards, op.cardName) : [];
  if (cards.length !== 1) throw Error("请用完整且唯一的卡名指定计划卡牌。");
  const card = cards[0];
  const requirement = plan.cards.find(({ id }) => id === card.id);
  if (["set_card", "add_slot"].includes(op.action) && !requirement && card.state !== "active")
    throw Error("只有可用卡牌可以加入计划。");
  if (op.action === "set_card") {
    const uses = op.uses ?? requirement?.target ?? planRules.defaultTarget;
    const score = op.score ?? requirement?.score ?? planRules.defaultItemScore;
    confirm(`${card.name} · ${t(`目标 ${uses} 次`, `Target: ${uses}`)}${plan.mode === "score" || op.score !== null ? t(` · 每次 ${score} 分`, ` · ${score} points per use`) : ""}`);
    configureBoardCard(state, plan, card.id, uses, score, now);
    return;
  }
  if (op.action === "remove_card") {
    if (!requirement) throw Error("这张卡不在这个计划里。");
    confirm(t(`移除「${card.name}」及其时间安排。`, `Remove “${card.name}” and its scheduled times.`));
    plan.cards = plan.cards.filter(({ id }) => id !== card.id);
    plan.slots = plan.slots?.filter(({ cardId }) => cardId !== card.id);
    saveBoardPlan(state, plan, now);
    return;
  }
  const describe = ({ day, time }: ReturnType<typeof slotSchedule>) => {
    let label = day;
    if (op.scope === "repeat") {
      if (op.period === "week") {
        const weekday = new Date(cycle.start);
        weekday.setDate(weekday.getDate() + Number(day) - 1);
        label = weekday.toLocaleDateString(chinese ? "zh-CN" : "en", { weekday: "long" });
      } else {
        label = op.period === "day" ? t("每天", "Every day") : t(`每月 ${day} 日`, `Day ${day} of each month`);
      }
    }
    return `${label} · ${time || t("全天", "All day")}`;
  };
  const next = op.schedule && slotSchedule(plan, op.schedule, anchor, requestedAt);
  if (op.action === "add_slot") {
    if (!next) throw Error("请提供新的时间安排。");
    confirm(t(`安排「${card.name}」 · ${describe(next)}`, `Schedule “${card.name}” · ${describe(next)}`));
    putBoardCard(state, plan, card.id, now, next);
    return;
  }
  if (!stored || !op.existing) throw Error("请提供要修改的原安排日期和时间。");
  const previous = slotSchedule(plan, op.existing, anchor, requestedAt);
  const slots = plan.slots?.filter((slot) => slot.cardId === card.id &&
    slot.configured !== false && slot.day === previous.day && slot.time === previous.time) ?? [];
  if (slots.length !== 1) throw Error("找不到唯一的原时间安排，请在计划中选中具体条目。");
  if (op.action === "edit_slot") {
    if (!next) throw Error("请提供新的时间安排。");
    confirm(`${card.name} · ${describe(previous)} → ${describe(next)}`);
    updatePlanSlot(state, plan.id, slots[0].id, next.day, next.time, now);
  } else {
    confirm(t(`移除「${card.name}」的安排 · ${describe(previous)}`, `Remove the scheduled time for “${card.name}” · ${describe(previous)}`));
    plan.slots = plan.slots?.filter(({ id }) => id !== slots[0].id);
    saveBoardPlan(state, plan, now);
  }
}
