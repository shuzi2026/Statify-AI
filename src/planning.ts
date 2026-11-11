import { localDateKey } from "../shared/calendar";
import {
  planRules,
  planSafetyLimits,
  validPlanUses,
  validPlanScore,
} from "../shared/rules/plans";
import { planEntries } from "./entry-index";
import { textLimits, checkTextLength } from "./text-limits";
import {
  PlanSchema,
  type Plan,
  type State,
  type PlanCycle,
  type PlanMessage,
  type Card,
  uid,
} from "./model";

export const planDate = (ts: number) => localDateKey(ts);
export const periodLabel = { day: "每日", week: "每周", month: "每月" };
export { planReward } from "../shared/rules/plans";
export function bounds(period: Plan["period"], at: number) {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  if (period === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (period === "month") d.setDate(1);
  const start = d.getTime();
  if (period === "month") d.setMonth(d.getMonth() + 1);
  else d.setDate(d.getDate() + (period === "week" ? 7 : 1));
  return {
    start,
    end: d.getTime(),
    key: period === "month" ? planDate(start).slice(0, 7) : planDate(start),
  };
}
export function firstAvailableDate(period: Plan["period"], now: number) {
  return planDate(bounds(period, now).start);
}
export function planBounds(p: Plan, now: number) {
  return bounds(
    p.period,
    p.scope === "once"
      ? new Date(p.anchor + "T00:00:00").getTime()
      : Math.max(
          now,
          new Date((p.anchor || planDate(p.createdAt)) + "T00:00:00").getTime(),
        ),
  );
}
export function planLocked(p: Plan, now: number) {
  return !!p.scope && now >= planBounds(p, now).end;
}
export function newPlan(now: number): Plan {
  return {
    id: uid(),
    name: "",
    period: "day",
    mode: "cards",
    target: planRules.defaultTarget,
    cards: [],
    active: true,
    createdAt: now,
    scope: "repeat",
    anchor: firstAvailableDate("day", now),
    draft: true,
    timeline: false,
    slots: [],
  };
}
export function validDate(value: string) {
  const t = new Date(value + "T00:00:00").getTime();
  return Number.isFinite(t) && planDate(t) === value;
}
export function planCounts(
  s: State,
  p: Plan | PlanCycle,
  b: { start: number; end: number },
  startsAt: number,
  completedBy = Infinity,
) {
  const planId = "planId" in p ? p.planId : p.id;
  const rows = planEntries(
      s.entries,
      planId,
      Math.max(b.start, startsAt),
      b.end,
      completedBy,
    ),
    totals = new Map<string, number>();
  for (const e of rows) totals.set(e.cardId, (totals.get(e.cardId) || 0) + 1);
  return p.cards.map((r) => ({
    ...r,
    value: Math.min(r.target, totals.get(r.id) || 0),
  }));
}
export function cycleProgress(s: State, c: PlanCycle, completedBy = Infinity) {
  const counts = planCounts(s, c, c, c.startsAt, completedBy),
    target =
      c.mode === "cards" ? counts.reduce((v, r) => v + r.target, 0) : c.target;
  const value = Math.min(
    target,
    counts.reduce(
      (v, r) => v + r.value * (c.mode === "score" ? (r.score ?? 0) : 1),
      0,
    ),
  );
  return { value, target, done: target > 0 && value >= target, counts };
}
export function planProgress(s: State, p: Plan, now: number) {
  if (!p.scope) {
    const b = bounds(p.period, now),
      rows = planEntries(s.entries, p.id, b.start, b.end);
    const counts = p.cards
        .filter((r) =>
          s.cards.some((c) => c.id === r.id && c.state !== "abandoned"),
        )
        .map((r) => ({
          ...r,
          value: Math.min(
            r.target,
            rows.filter((e) => e.cardId === r.id).length,
          ),
        })),
      target =
        p.mode === "score"
          ? p.target
          : counts.reduce((n, r) => n + r.target, 0),
      value = Math.min(
        target,
        p.mode === "score"
          ? rows.reduce((n, e) => n + e.score, 0)
          : counts.reduce((n, r) => n + r.value, 0),
      );
    return { value, target, done: target > 0 && value >= target, counts };
  }
  const b = planBounds(p, now),
    c = s.planCycles.find((c) => c.planId === p.id && c.key === b.key);
  return cycleProgress(
    s,
    c || {
      ...b,
      id: "preview",
      planId: p.id,
      startsAt: p.startsAt ?? now,
      scope: p.scope || "repeat",
      period: p.period,
      mode: p.mode,
      target: p.target,
      cards: p.cards,
    },
  );
}
export function ensurePlanCycles(s: State, now: number) {
  const existingCycles = new Set(
    s.planCycles.map((c) => c.planId + ":" + c.key),
  );
  for (const p of s.plans) {
    if (!p.scope || p.draft || !p.startsAt) continue;
    let b = bounds(p.period, p.startsAt),
      guard = 0;
    while (b.start <= now && guard++ < planSafetyLimits.cycleIterations) {
      if (
        p.scope === "once" &&
        b.key !==
          bounds(p.period, new Date(p.anchor + "T00:00:00").getTime()).key
      )
        break;
      const existing = existingCycles.has(p.id + ":" + b.key);
      if (!existing && p.active)
        s.planCycles.push({
          ...b,
          id: p.id + ":" + b.key,
          planId: p.id,
          startsAt: Math.max(p.startsAt, b.start),
          scope: p.scope,
          period: p.period,
          mode: p.mode,
          target: p.target,
          cards: structuredClone(p.cards),
          timeline: !!p.timeline,
          slots: structuredClone(p.slots || []),
        });
      if (p.scope === "once") break;
      b = bounds(p.period, b.end);
    }
  }
  const evaluated = {
    ...s,
    entries: Object.freeze([...s.entries]) as unknown as State["entries"],
  };
  for (const c of s.planCycles) {
    if (!c.doneAt && cycleProgress(evaluated, c).done) c.doneAt = now;
  }
}
export function recurringProgress(
  s: State,
  period: Plan["period"],
  now: number,
) {
  const live = s.planCycles.find(
      (c) =>
        c.scope === "repeat" &&
        c.period === period &&
        c.cards.length &&
        c.startsAt <= now &&
        now < c.end,
    ),
    p =
      (live ? s.plans.find((p) => p.id === live.planId) : undefined) ||
      s.plans.find(
        (p) =>
          p.active &&
          p.scope === "repeat" &&
          p.period === period &&
          !p.draft &&
          p.startsAt !== undefined &&
          p.startsAt <= now,
      ) ||
      s.plans.find(
        (p) =>
          p.active &&
          !p.scope &&
          p.period === period &&
          (period !== "day" || p.id === s.dailyPlan),
      );
  return p ? planProgress(s, p, now) : null;
}
/** A date-specific plan replaces the repeating target for that calendar period. */
function executionGroups(
  s: State,
  period: Plan["period"],
  now: number,
  onlyKey?: string,
) {
  const groups = new Map<
      string,
      {
        start: number;
        items: {
          planId: string;
          scope: PlanCycle["scope"];
          progress: ReturnType<typeof cycleProgress>;
        }[];
      }
    >(),
    modern = new Set<string>();
  const add = (
    key: string,
    start: number,
    planId: string,
    scope: PlanCycle["scope"],
    progress: ReturnType<typeof cycleProgress>,
  ) => {
    if (progress.target <= 0) return;
    const group = groups.get(key) || { start, items: [] };
    group.items.push({ planId, scope, progress });
    groups.set(key, group);
  };
  for (const c of s.planCycles) {
    if (
      c.period !== period ||
      c.start > now ||
      c.startsAt > now ||
      !c.cards.length ||
      (onlyKey && c.key !== onlyKey)
    )
      continue;
    modern.add(c.planId + ":" + c.key);
    add(c.key, c.start, c.planId, c.scope, cycleProgress(s, c, now));
  }
  // Imported daily snapshots remain readable; a modern snapshot of the same plan wins.
  for (const d of period === "day" ? s.days : []) {
    if (
      !d.enabled ||
      (onlyKey && d.date !== onlyKey) ||
      modern.has(d.planId + ":" + d.date)
    )
      continue;
    const start = new Date(d.date + "T00:00:00").getTime();
    if (start > now) continue;
    const rows = planEntries(
        s.entries,
        d.planId,
        start,
        bounds("day", start).end,
        now,
      ),
      counts = d.requirements.map((r) => ({
        ...r,
        value: Math.min(r.target, rows.filter((e) => e.cardId === r.id).length),
      }));
    const target =
        d.mode === "score"
          ? d.target
          : counts.reduce((n, r) => n + r.target, 0),
      value = Math.min(
        target,
        d.mode === "score"
          ? rows.reduce((n, e) => n + e.score, 0)
          : counts.reduce((n, r) => n + r.value, 0),
      );
    add(d.date, start, d.planId, "repeat", {
      value,
      target,
      done: target > 0 && value >= target,
      counts,
    });
  }
  return [...groups].map(([key, g]) => {
    const specified = g.items.filter((p) => p.scope === "once"),
      items = specified.length ? specified : g.items;
    return {
      key,
      start: g.start,
      scope: specified.length ? ("once" as const) : ("repeat" as const),
      progress: {
        value: items.reduce((n, p) => n + p.progress.value, 0),
        target: items.reduce((n, p) => n + p.progress.target, 0),
        done: items.every((p) => p.progress.done),
        counts: items.flatMap(({ planId, progress }) =>
          progress.counts.map((count) => ({ ...count, planId })),
        ),
      },
    };
  });
}
export function executionPlan(s: State, period: Plan["period"], now: number) {
  return executionGroups(s, period, now, bounds(period, now).key)[0] || null;
}
export function dailyPlanProgress(s: State, now: number) {
  return executionPlan(s, "day", now)?.progress || null;
}

export function todayPlanTodo(
  s: State,
  now: number,
  progress: ReturnType<typeof dailyPlanProgress>,
) {
  const day = bounds("day", now);
  const dailyPlanIds = new Set(progress?.counts.map(({ planId }) => planId));
  const cards = new Map(s.cards.map((card) => [card.id, card]));
  type TodoRow = {
    key: string;
    card: Card;
    value: number;
    target: number;
    done: boolean;
    times: number[];
    nextTime?: number;
  };
  const rows = new Map<string, TodoRow>();
  const messageIds = new Set<string>();
  const add = (
    planId: string,
    count: { id: string; value: number; target: number },
  ) => {
    const card = cards.get(count.id);
    if (!card) return;
    const key = JSON.stringify([planId, count.id]);
    const existing = rows.get(key);
    if (existing) return existing;
    const row: TodoRow = {
      key,
      card,
      value: count.value,
      target: count.target,
      done: count.value >= count.target,
      times: [],
    };
    rows.set(key, row);
    return row;
  };
  for (const count of progress?.counts ?? []) add(count.planId, count);

  const plans = new Map(s.plans.map((plan) => [plan.id, plan]));
  for (const cycle of s.planCycles) {
    if (cycle.start > now || cycle.startsAt > now || cycle.end <= now) continue;
    if (cycle.period === "day" && !dailyPlanIds.has(cycle.planId)) continue;
    const plan = plans.get(cycle.planId);
    if (!plan?.scope) continue;
    const timeline = cycle.timeline ?? plan.timeline;
    if (!timeline && cycle.period !== "day") continue;
    const slots = cycleSlots(plan, cycle, now);
    if (!slots.length) continue;
    const calendar = { ...plan, scope: cycle.scope, period: cycle.period };
    const scheduled = slots
      .filter((slot) => slot.configured !== false)
      .map((slot) => ({ slot, dueAt: slotStamp(calendar, slot, cycle.start) }))
      .filter(({ dueAt }) => dueAt >= cycle.start && dueAt < day.end)
      .sort((a, b) => a.dueAt - b.dueAt);
    const ordinals = new Map<string, number>();
    let counts: Map<string, ReturnType<typeof planCounts>[number]> | undefined;
    for (const { slot, dueAt } of scheduled) {
      // As with reminders, each counted action covers the next occurrence in the cycle.
      const ordinal = (ordinals.get(slot.cardId) ?? 0) + 1;
      ordinals.set(slot.cardId, ordinal);
      if (dueAt < day.start) continue;
      counts ??= new Map(
        planCounts(s, cycle, cycle, cycle.startsAt, now).map((count) => [
          count.id,
          count,
        ]),
      );
      const count = counts.get(slot.cardId);
      if (!count) continue;
      const row = add(cycle.planId, count);
      if (!row) continue;
      if (slot.time) {
        if (!row.times.includes(dueAt)) row.times.push(dueAt);
        if (!row.done && count.value < ordinal)
          row.nextTime = Math.min(row.nextTime ?? dueAt, dueAt);
      }
      // Earlier slots remain visible in the checklist even when alerts are suppressed.
      if (timeline && (!slot.time || dueAt >= cycle.startsAt))
        messageIds.add(`${cycle.planId}:${slot.id}:${cycle.key}`);
    }
  }

  const tasks = [...rows.values()];
  for (const row of tasks) row.times.sort((a, b) => a - b);
  const sortTime = (row: TodoRow) =>
    (row.done ? row.times[row.times.length - 1] : row.nextTime) ?? day.end;
  tasks.sort(
    (a, b) => Number(a.done) - Number(b.done) || sortTime(a) - sortTime(b),
  );
  return { tasks, messageIds };
}
export function reducePlanUses(
  p: Plan,
  cardId: string,
  target: number,
  now: number,
) {
  p.cards = p.cards.map((r) => (r.id === cardId ? { ...r, target } : r));
  const keep = new Set(
    [...(p.slots || [])]
      .filter((slot) => slot.cardId === cardId)
      .sort(
        (a, b) =>
          slotStamp(p, a, planBounds(p, now).start) -
          slotStamp(p, b, planBounds(p, now).start),
      )
      .slice(0, target)
      .map((slot) => slot.id),
  );
  p.slots = p.slots?.filter(
    (slot) => slot.cardId !== cardId || keep.has(slot.id),
  );
}
export function slotStamp(
  p: Plan,
  slot: NonNullable<Plan["slots"]>[number],
  cycleStart: number,
) {
  const b = bounds(p.period, cycleStart),
    d = new Date(b.start);
  if (p.scope === "once") {
    if (!validDate(slot.day)) return NaN;
    d.setTime(new Date(slot.day + "T00:00:00").getTime());
  } else if (p.period === "week") d.setDate(d.getDate() + Number(slot.day) - 1);
  else if (p.period === "month") {
    const last = new Date(b.end);
    last.setDate(0);
    d.setDate(Math.min(Number(slot.day), last.getDate()));
  }
  const [h, m] = (slot.time || "00:00").split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}
function validateSlots(s: State, p: Plan, now: number) {
  const ids = new Set<string>();
  for (const slot of p.slots || []) {
    if (ids.has(slot.id)) throw Error("时间安排不能重复");
    ids.add(slot.id);
    const r = p.cards.find((r) => r.id === slot.cardId);
    if (!r) throw Error("请先将这张卡牌加入计划");
    if ((p.slots || []).filter((x) => x.cardId === r.id).length > r.target)
      throw Error("时间安排次数不能超过计划次数");
    if (p.scope === "once") {
      const b = planBounds(p, now);
      if (
        !validDate(slot.day) ||
        new Date(slot.day + "T00:00:00").getTime() < b.start ||
        new Date(slot.day + "T00:00:00").getTime() >= b.end
      )
        throw Error("日期须在所选计划周期内");
    } else if (
      !/^\d+$/.test(slot.day) ||
      Number(slot.day) < 1 ||
      Number(slot.day) >
        (p.period === "week" ? 7 : p.period === "month" ? 31 : 1)
    )
      throw Error("请选择有效的周期日期");
  }
  // Check shared calendar occupancy over a full annual cycle and any distant one-off periods.
  const first = Math.max(now, p.startsAt || p.createdAt),
    windows = [
      {
        start: bounds("day", first).start,
        end: new Date(
          new Date(first).getFullYear() + 1,
          new Date(first).getMonth(),
          new Date(first).getDate() + 1,
        ).getTime(),
      },
    ];
  const plans = s.plans
    .filter((x) => x.id !== p.id && x.scope && x.active)
    .concat(p);
  for (const plan of plans.filter((x) => x.scope === "once")) {
    const b = planBounds(plan, now);
    if (b.end > windows[0].start) windows.push(b);
  }
  for (const window of windows) {
    const intervals: {
      start: number;
      end: number;
      slot: string;
      plan: string;
    }[] = [];
    for (const plan of plans) {
      if (!plan.timeline) continue;
      const earliest = Math.max(
        window.start - 86400000,
        plan.startsAt || new Date(plan.anchor + "T00:00:00").getTime(),
      );
      let b =
          plan.scope === "once"
            ? planBounds(plan, now)
            : bounds(plan.period, earliest),
        guard = 0;
      while (
        b.start < window.end &&
        guard++ < planSafetyLimits.occupancyIterations
      ) {
        for (const slot of plan.slots || []) {
          if (!slot.time || slot.configured === false) continue;
          const t = slotStamp(plan, slot, b.start),
            end = t + slot.minutes * 60000;
          if (
            t >= earliest &&
            t < window.end &&
            (t >= window.start || end > window.start)
          )
            intervals.push({ start: t, end, slot: slot.id, plan: plan.id });
        }
        if (plan.scope === "once") break;
        b = bounds(plan.period, b.end);
      }
    }
    intervals.sort((a, b) => a.start - b.start || b.end - a.end);
    for (let i = 0; i < intervals.length; i++) {
      const a = intervals[i];
      for (
        let j = i + 1;
        j < intervals.length && intervals[j].start < a.end;
        j++
      ) {
        const b = intervals[j];
        if (a.slot !== b.slot || a.plan !== b.plan)
          throw Error("该时段已被固定时长任务占用，请换一个时间");
      }
    }
  }
}
export function savePlan(s: State, value: Plan, now: number, activate = false) {
  checkTextLength(
    value.name,
    textLimits.planName,
    "计划名称",
    s.plans.find((p) => p.id === value.id)?.name,
  );
  const p = PlanSchema.parse(value),
    old = s.plans.find((x) => x.id === p.id);
  p.scope = p.scope || "repeat";
  p.anchor = p.anchor || planDate(now);
  p.slots = p.slots || [];
  if (old && !old.scope) {
    p.draft = true;
    p.startsAt = undefined;
  }
  if (!validDate(p.anchor)) throw Error("请选择有效日期");
  const b = planBounds(p, now);
  if (old?.scope && planLocked(old, now))
    throw Error("这个计划周期已结束，不能修改历史计划");
  if (now >= b.end) throw Error("这个计划周期已结束，请选择当前或未来周期");
  if (
    old?.scope &&
    (p.scope !== old.scope ||
      p.period !== old.period ||
      p.anchor !== old.anchor)
  ) {
    if (!old.draft) throw Error("已有计划的周期不能更改，请创建其他周期的计划");
    if (old.slots?.length) throw Error("请先移除时间安排，再修改计划周期");
  }
  if (
    s.plans.some(
      (x) =>
        x.id !== p.id &&
        x.active &&
        x.scope === p.scope &&
        x.period === p.period &&
        (p.scope === "repeat" || planBounds(x, now).key === b.key),
    )
  )
    throw Error("这个周期已有计划，请编辑已有计划");
  if (new Set(p.cards.map((r) => r.id)).size !== p.cards.length)
    throw Error("同一卡牌不能重复加入计划");
  for (const r of p.cards) {
    const card = s.cards.find((c) => c.id === r.id);
    if (!card) throw Error("找不到计划中的卡牌");
    if (card.shopping) throw Error("购物卡不能加入行动计划。");
    if (
      p.period === "day" &&
      card.capPeriod === "day" &&
      card.cap > 0 &&
      r.target > card.cap
    )
      throw Error(
        `「${card.name}」每天最多完成${card.cap}次，计划次数不能超过此限制`,
      );
    r.score = r.score ?? card.score;
  }
  if (activate && !p.cards.length) throw Error("请至少加入一张卡牌");
  if (
    (activate || !p.draft) &&
    p.cards.length &&
    p.mode === "score" &&
    p.target > p.cards.reduce((v, r) => v + r.target * (r.score || 0), 0)
  )
    throw Error("目标分数超过这些卡牌可获得的总分");
  if (activate) {
    p.draft = false;
    p.startsAt = Math.max(now, b.start);
  }
  p.startsAt =
    old?.draft && activate ? p.startsAt : (old?.startsAt ?? p.startsAt);
  p.name =
    p.name.trim() ||
    `${p.scope === "repeat" ? periodLabel[p.period] : p.period === "day" ? "当天" : p.period === "week" ? "本周" : "本月"}计划`;
  validateSlots(s, p, now);
  s.plans = s.plans.filter((x) => x.id !== p.id).concat(p);
  for (const m of s.messages)
    if (m.planId === p.id && !p.slots.some((slot) => slot.id === m.slotId))
      m.read = true;
  if (p.startsAt && (!p.draft || old?.startsAt)) {
    ensurePlanCycles(s, now);
    const c = s.planCycles.find((c) => c.planId === p.id && c.key === b.key);
    if (c) {
      c.startsAt = Math.max(p.startsAt, c.start);
      c.mode = p.mode;
      c.target = p.target;
      c.cards = structuredClone(p.cards);
      c.timeline = !!p.timeline;
      c.slots = structuredClone(p.slots || []);
    }
    ensurePlanCycles(s, now);
  }
  return p;
}
export function addPlanSlot(
  s: State,
  planId: string,
  cardId: string,
  day: string,
  time: string,
  now: number,
) {
  const p = structuredClone(s.plans.find((x) => x.id === planId));
  if (!p) throw Error("请先建立计划");
  const c = s.cards.find((x) => x.id === cardId);
  if (!c) throw Error("找不到卡牌");
  let r = p.cards.find((r) => r.id === cardId);
  if (!r) {
    r = {
      id: cardId,
      target: planRules.defaultTarget,
      score: planRules.defaultItemScore,
    };
    p.cards.push(r);
  }
  r.target = Math.max(
    r.target,
    (p.slots || []).filter((slot) => slot.cardId === cardId).length + 1,
  );
  p.timeline = true;
  p.slots = [
    ...(p.slots || []),
    {
      id: uid(),
      cardId,
      day,
      time,
      configured: true,
      minutes: c.method === "duration" ? Math.round(c.minutes) : 0,
    },
  ];
  return savePlan(s, p, now);
}
export function findBoardPlan(
  s: State,
  scope: NonNullable<Plan["scope"]>,
  period: Plan["period"],
  anchor: string,
  now: number,
) {
  const key = bounds(period, new Date(anchor + "T00:00:00").getTime()).key,
    match = (p: Plan) =>
      p.scope === scope &&
      p.period === period &&
      (scope === "repeat" || planBounds(p, now).key === key);
  return (
    s.plans.find((p) => p.active && match(p)) ||
    s.plans.find(match) ||
    (scope === "repeat"
      ? s.plans.find(
          (p) =>
            !p.scope &&
            p.active &&
            p.period === period &&
            (period !== "day" || p.id === s.dailyPlan),
        )
      : undefined)
  );
}
export function saveBoardPlan(s: State, value: Plan, now: number) {
  const p = structuredClone(value),
    old = s.plans.find((x) => x.id === p.id);
  p.active = p.cards.length > 0;
  p.draft = !p.active;
  if (!p.active) p.slots = [];
  if (p.mode === "score")
    p.target = Math.min(
      p.target,
      Math.max(
        1,
        p.cards.reduce(
          (n, r) => n + r.target * (r.score ?? planRules.defaultItemScore),
          0,
        ),
      ),
    );
  return savePlan(
    s,
    p,
    now,
    p.active && (!old?.scope || !!old.draft || !old.startsAt),
  );
}
export function putBoardCard(
  s: State,
  value: Plan,
  cardId: string,
  now: number,
  schedule?: { day: string; time: string; configured?: boolean },
  increment = true,
) {
  const old = findBoardPlan(
      s,
      value.scope || "repeat",
      value.period,
      value.anchor || planDate(now),
      now,
    ),
    p = structuredClone(
      old?.cards.length ? old : { ...value, id: old?.id || value.id },
    ),
    c = s.cards.find((c) => c.id === cardId);
  if (!c) throw Error("找不到卡牌");
  let r = p.cards.find((r) => r.id === cardId);
  if (!r) {
    r = {
      id: cardId,
      target: planRules.defaultTarget,
      score: planRules.defaultItemScore,
    };
    p.cards.push(r);
  } else if (increment && !schedule) r.target++;
  let slotId: string | undefined;
  if (schedule) {
    if (!schedule.day && schedule.time)
      throw Error("请选择日期，或将时间留为 --:--");
    schedule = schedule.day
      ? schedule
      : {
          ...schedule,
          day: p.scope === "once" ? p.anchor! : "1",
          configured: false,
        };
    r.target = Math.max(
      r.target,
      (p.slots || []).filter((slot) => slot.cardId === cardId).length + 1,
    );
    slotId = uid();
    p.timeline = true;
    p.slots = [
      ...(p.slots || []),
      {
        id: slotId,
        cardId,
        configured: true,
        ...schedule,
        minutes: c.method === "duration" ? Math.round(c.minutes) : 0,
      },
    ];
  }
  const plan = saveBoardPlan(s, p, now);
  return { plan, cardId, slotId };
}
export function updatePlanSlot(
  s: State,
  planId: string,
  slotId: string,
  day: string,
  time: string,
  now: number,
) {
  const p = structuredClone(s.plans.find((x) => x.id === planId)),
    slot = p?.slots?.find((x) => x.id === slotId);
  if (!p || !slot) throw Error("这个安排已移除，请重新选择");
  if (!day && time) throw Error("请选择日期，或将时间留为 --:--");
  const configurationChanged = (slot.configured !== false) !== !!day;
  slot.configured = !!day;
  // Preserve the existing save contract: configured=false makes this date inert.
  day ||= p.scope === "once" ? p.anchor! : "1";
  if (configurationChanged || slot.day !== day || slot.time !== time) {
    slot.id = uid();
    slot.day = day;
    slot.time = time;
  }
  return savePlan(s, p, now);
}
export function planActionIds(s: State, now: number) {
  return s.planCycles
    .filter(
      (c) =>
        now >= c.startsAt &&
        now < c.end &&
        c.cards.some((r) => s.cards.some((card) => card.id === r.id)),
    )
    .map((c) => c.planId);
}
// Preflight every affected plan before mutating either the card or its reservations.
export function syncPlanCardDuration(s: State, card: Card, now: number) {
  const previous = s.cards.find((c) => c.id === card.id),
    limitChanged =
      previous?.cap !== card.cap || previous?.capPeriod !== card.capPeriod;
  const minutes = card.method === "duration" ? card.minutes : 0,
    plans = structuredClone(s.plans),
    changed: Plan[] = [];
  for (const p of plans) {
    if (p.scope === "once" && planBounds(p, now).end <= now) continue;
    if (
      limitChanged &&
      p.period === "day" &&
      card.capPeriod === "day" &&
      card.cap > 0 &&
      p.cards.some((r) => r.id === card.id && r.target > card.cap)
    )
      throw Error(
        `请先将关联每日计划中的「${card.name}」次数调至${card.cap}次以内`,
      );
    const slots =
      p.slots?.filter(
        (slot) => slot.cardId === card.id && slot.minutes !== minutes,
      ) || [];
    if (!slots.length) continue;
    for (const slot of slots) slot.minutes = minutes;
    changed.push(p);
  }
  const staged = { ...s, plans };
  for (const p of changed) validateSlots(staged, p, now);
  if (!changed.length) return;
  s.plans = plans;
  for (const c of s.planCycles)
    if (c.end > now && changed.some((p) => p.id === c.planId))
      for (const slot of c.slots || [])
        if (slot.cardId === card.id) slot.minutes = minutes;
}
type NoticeResult = { notices: PlanMessage[]; live: PlanMessage[] };
function cycleSlots(plan: Plan, cycle: PlanCycle, now: number) {
  return (
    cycle.slots ??
    (planBounds(plan, now).key === cycle.key ? plan.slots : undefined) ??
    []
  );
}
const noticeCache = new WeakMap<
  State,
  { at: number; next: number; result: NoticeResult }
>();
export function planMessages(s: State, now: number) {
  const prior = noticeCache.get(s);
  if (
    Object.isFrozen(s.entries) &&
    prior &&
    now >= prior.at &&
    now < prior.next
  )
    return prior.result;
  let next = Infinity;
  const notices: PlanMessage[] = [],
    live: PlanMessage[] = [],
    known = new Set(s.messages.map((m) => m.id));
  for (const cycle of s.planCycles) {
    const p = s.plans.find((p) => p.id === cycle.planId);
    if (cycle.startsAt > now) next = Math.min(next, cycle.startsAt);
    if (!p || !p.scope || cycle.startsAt > now) continue;
    if (!(cycle.timeline ?? p.timeline)) continue;
    const slots = cycleSlots(p, cycle, now);
    if (!slots.length) continue;
    const q = { ...p, scope: cycle.scope, period: cycle.period },
      sorted = slots
        .filter((slot) => slot.configured !== false)
        .sort(
          (a, c) => slotStamp(q, a, cycle.start) - slotStamp(q, c, cycle.start),
        );
    let counts: ReturnType<typeof planCounts> | undefined;
    for (let index = 0; index < sorted.length; index++) {
      const slot = sorted[index];
      if (slot.configured === false) continue;
      const dueAt = slotStamp(q, slot, cycle.start),
        c = s.cards.find((c) => c.id === slot.cardId),
        id = `${p.id}:${slot.id}:${cycle.key}`;
      if (!c || !Number.isFinite(dueAt) || known.has(id)) continue;
      if (
        !slot.time &&
        sorted
          .slice(0, index)
          .some(
            (x) =>
              x.cardId === slot.cardId &&
              !x.time &&
              slotStamp(q, x, cycle.start) === dueAt,
          )
      )
        continue;
      if (!slot.time && planDate(dueAt) < planDate(cycle.startsAt)) continue;
      const when = slot.time ? dueAt : Math.max(dueAt, cycle.startsAt);
      if (when > now) next = Math.min(next, when);
      if (slot.time && when + planRules.liveReminderMs > now)
        next = Math.min(next, when + planRules.liveReminderMs);
      if (now < when || (slot.time && dueAt < cycle.startsAt)) continue;
      counts ??= planCounts(s, cycle, cycle, cycle.startsAt);
      const n = sorted
        .slice(0, index + 1)
        .filter((x) => x.cardId === slot.cardId).length;
      const count = counts.find((r) => r.id === c.id)?.value || 0,
        started = s.actions.filter(
          (a) =>
            a.card.id === c.id &&
            a.plans.includes(p.id) &&
            a.startedAt >= cycle.startsAt &&
            a.startedAt < cycle.end,
        ).length;
      if (count + started >= n) continue;
      const message: PlanMessage = {
        id,
        planId: p.id,
        slotId: slot.id,
        cardId: c.id,
        name: c.name,
        dueAt: when,
        kind: slot.time ? "scheduled" : "date",
        read: false,
      };
      if (now >= when + (slot.time ? planRules.liveReminderMs : 0))
        notices.push(message);
      else if (slot.time) live.push(message);
    }
  }
  const result = { notices, live };
  if (Object.isFrozen(s.entries)) noticeCache.set(s, { at: now, next, result });
  return result;
}
export function syncPlanMessages(s: State, now: number) {
  s.messages.push(...planMessages(s, now).notices);
}
export function executionCycles(s: State, now: number) {
  const indexed = {
    ...s,
    entries: Object.isFrozen(s.entries)
      ? s.entries
      : (Object.freeze([...s.entries]) as unknown as State["entries"]),
  };
  return (["day", "week", "month"] as const).flatMap((period) =>
    executionGroups(indexed, period, now).map((g) => ({
      at: g.start,
      period,
      key: g.key,
      done: g.progress.done,
    })),
  );
}
export function setPlanMode(s: State, mode: State["planMode"], now: number) {
  if (mode !== "cards" && mode !== "score")
    throw Error("请选择有效的计划结算模式");
  const staged = structuredClone(s);
  staged.planMode = mode;
  for (const original of [...staged.plans]) {
    if (original.scope && planLocked(original, now)) continue;
    const p = structuredClone(original);
    p.mode = mode;
    if (mode === "score") {
      const max = p.cards.reduce(
        (total, r) =>
          total + r.target * (r.score ?? planRules.defaultItemScore),
        0,
      );
      if (p.cards.length && max === 0)
        throw Error("计划卡牌积分均为0，请先设置积分");
      p.target = Math.max(
        planRules.minTarget,
        Math.min(p.target, max || planRules.minTarget),
      );
    }
    if (p.scope) saveBoardPlan(staged, p, now);
    else staged.plans = staged.plans.map((x) => (x.id === p.id ? p : x));
  }
  s.planMode = mode;
  s.plans = staged.plans;
  s.planCycles = staged.planCycles;
  s.messages = staged.messages;
}
export function configureBoardCard(
  s: State,
  value: Plan,
  cardId: string,
  target: number,
  score: number | undefined,
  now: number,
) {
  if (!validPlanUses(target))
    throw Error(
      "计划次数须为{min}到{max}的整数"
        .replace("{min}", String(planRules.minUses))
        .replace("{max}", String(planRules.maxUses)),
    );

  if (!s.cards.some((c) => c.id === cardId)) throw Error("找不到卡牌");
  const staged = structuredClone(s),
    p = structuredClone(
      findBoardPlan(
        staged,
        value.scope || "repeat",
        value.period,
        value.anchor || planDate(now),
        now,
      ) || value,
    );
  if (p.mode === "score" && !validPlanScore(score))
    throw Error(
      "每次积分须为{min}到{max}的整数"
        .replace("{min}", String(planRules.minScore))
        .replace("{max}", String(planRules.maxScore)),
    );
  const r = p.cards.find((r) => r.id === cardId);
  if (r) {
    reducePlanUses(p, cardId, target, now);
    if (score !== undefined)
      p.cards = p.cards.map((r) => (r.id === cardId ? { ...r, score } : r));
  } else
    p.cards.push({
      id: cardId,
      target,
      score: score ?? planRules.defaultItemScore,
    });
  const plan = saveBoardPlan(staged, p, now);
  s.plans = staged.plans;
  s.planCycles = staged.planCycles;
  s.messages = staged.messages;
  return plan;
}
