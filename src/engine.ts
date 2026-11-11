import type { RuleContext } from "./rules/context";
import { localDateKey } from "../shared/calendar";
import { attributeRules, growthCurve, ratings } from "../shared/rules/growth";
import { statusRules } from "../shared/rules/status";
import { actionRules } from "../shared/rules/actions";
import { planRules, planSafetyLimits } from "../shared/rules/plans";
import { meterBounds } from "./meters";
import { entryIndex } from "./entry-index";
import { textLimits, checkTextLength } from "./text-limits";
import {
  type State,
  type Card,
  type Action,
  type Entry,
  CardSchema,
  statusKeys,
  uid,
  rules,
} from "./model";
import {
  ensurePlanCycles,
  cycleProgress,
  planProgress,
  planActionIds,
  syncPlanMessages,
  executionCycles,
  planReward,
  syncPlanCardDuration,
} from "./planning";
export const clamp = (n: number, a = statusRules.min, b = statusRules.max) =>
  Math.max(a, Math.min(b, n));
export const dateKey = localDateKey;
export function periodKey(ts: number, period: string) {
  const d = new Date(ts);
  if (period === "month") return dateKey(ts).slice(0, 7);
  if (period === "week") {
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  }
  return dateKey(d.getTime());
}
export function sleepCycle(now: number) {
  const d = new Date(now);
  d.setHours(d.getHours() - statusRules.sleepResetHour);
  return dateKey(d.getTime());
}
export function statusValue(
  s: State,
  key: (typeof statusKeys)[number],
  now: number,
) {
  const v = s.states[key];
  return clamp(Math.round(v.base + (v.expires > now ? v.offset : 0)));
}
const h = (t: number) => 3 * t * t - 2 * t * t * t;
export function coefficient(s: State, now: number) {
  return (
    statusKeys.reduce((sum, k) => {
      const x = statusValue(s, k, now);
      return (
        sum +
        (k === "sleep" && s.sleepCycle !== sleepCycle(now)
          ? statusRules.neutralCoefficient
          : k === "stress"
            ? statusRules.neutralCoefficient -
              statusRules.stressPenalty *
                h(Math.max(0, x - statusRules.midpoint) / statusRules.midpoint)
            : statusRules.baseCoefficient +
              statusRules.coefficientSpan * h(x / statusRules.max))
      );
    }, 0) / statusKeys.length
  );
}
export function threshold(level: number) {
  const c = growthCurve,
    t = Math.floor(level / c.bandSize),
    o = level % c.bandSize,
    peak = c.peakBase + c.peakStep * t * (t + 1);
  if (level === 0) return c.initialThreshold;
  if (o === 0) return peak;
  if (t === 0)
    return Math.round(
      c.initialThreshold + c.firstBandRise * (o / (c.bandSize - 1)) ** c.power,
    );
  return Math.round(
    peak * c.troughRatio +
      (c.peakBase + c.peakStep * (t + 1) * (t + 2) - peak * c.troughRatio) *
        ((o - 1) / (c.bandSize - 1)) ** c.power,
  );
}
export function cumulative(level: number) {
  let n = 0;
  for (let i = 0; i < Math.floor(level); i++) n += threshold(i);
  return n;
}
export function growth(a: State["attributes"][number]) {
  let rest = cumulative(a.initial) + a.earned,
    level = 0;
  while (level < attributeRules.maxLevel && rest >= threshold(level)) {
    rest -= threshold(level++);
  }
  return {
    level,
    progress: rest,
    next: threshold(level),
    total: cumulative(a.initial) + a.earned,
  };
}
export const trialActive = (_s: State, context: RuleContext) =>
  context.member || context.trial;
export const attrAllowed = (
  s: State,
  a: State["attributes"][number],
  context: RuleContext,
) =>
  a.slot >= 0 &&
  (context.member ||
    (a.slot < attributeRules.freeSlots && a.original) ||
    (a.slot >= attributeRules.freeSlots && trialActive(s, context)));
export function elapsed(a: Action, now: number) {
  return (
    Math.max(
      0,
      a.elapsed +
        (a.runningSince === null ? 0 : Math.max(0, now - a.runningSince)),
    ) / 1000
  );
}
export function timeWindowError(windows: Card["timeWindows"]) {
  for (let index = 0; index < windows.length; index++) {
    const w = windows[index];
    if (!w.start && !w.end) continue;
    if (!w.start || !w.end)
      return {
        index,
        field: w.start ? "end" : "start",
        message: "请补全第" + (index + 1) + "条可完成时段后再保存",
      };
    if (w.end <= w.start)
      return { index, field: "end", message: "结束时间须晚于开始时间" };
  }
  const ordered = windows
    .map((w, index) => ({ ...w, index }))
    .filter((w) => w.start && w.end)
    .sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < ordered.length; i++)
    if (ordered[i].start < ordered[i - 1].end)
      return {
        index: ordered[i].index,
        field: "start",
        message: "可完成时段不能重叠",
      };

  return null;
}
export function inWindow(c: Card, now: number) {
  const windows = c.timeWindows?.length
    ? c.timeWindows
    : c.timeStart && c.timeEnd
      ? [{ start: c.timeStart, end: c.timeEnd }]
      : [];
  if (!windows.length) return true;
  const d = new Date(now),
    v = d.getHours() * 60 + d.getMinutes(),
    to = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));
  return windows.some((w) => {
    const a = to(w.start),
      b = to(w.end);
    return a === b || (a < b ? v >= a && v < b : v >= a || v < b);
  });
}
const outsideCardWindow = (c: Card, now: number) =>
  c.timeMode === "block" && !inWindow(c, now);
const reachedCardCap = (s: State, c: Card, now: number) =>
  c.cap > 0 &&
    (entryIndex(s.entries).byCard.get(c.id) || []).filter(
      (e) =>
        e.counted &&
        e.endedAt >= c.statsSince &&
        periodKey(e.startedAt, c.capPeriod) === periodKey(now, c.capPeriod),
    ).length >= c.cap;
export function cardUseRestrictions(s: State, c: Card, now: number) {
  return { outsideWindow: outsideCardWindow(c, now), capReached: reachedCardCap(s, c, now) };
}
export function unavailable(
  s: State,
  c: Card,
  now: number,
  restrictions?: ReturnType<typeof cardUseRestrictions>,
) {
  if (c.shopping) return "购物卡请在仓库中使用。";
  if (c.state !== "active") return "这张卡牌已收起";
  if (s.restUntil > now) return "正在休息，可先退出休息模式";
  if (c.life === "consumable" && c.count >= c.uses) return "这张卡牌已完成";
  if (restrictions?.outsideWindow ?? outsideCardWindow(c, now))
    return "还没到可用时段";
  if (restrictions?.capReached ?? reachedCardCap(s, c, now))
    return "已达到本周期次数上限";
  if (s.actions.some((a) => a.card.id === c.id))
    return "这张卡牌还有未结束行动";
  if (
    ["duration", "timed", "quantity"].includes(c.method) &&
    s.actions.some((a) =>
      ["duration", "timed", "quantity"].includes(a.card.method),
    )
  )
    return "先结束当前计时";
  return "";
}
export function start(s: State, id: string, now: number) {
  const c = s.cards.find((c) => c.id === id);
  if (!c) throw Error("找不到卡牌");
  const reason = unavailable(s, c, now);
  if (reason) throw Error(reason);
  rollDays(s, now);
  const timed = ["duration", "timed", "quantity"].includes(c.method);
  const a: Action = {
    id: uid(),
    card: structuredClone(c),
    startedAt: now,
    elapsed: 0,
    runningSince: timed ? now : null,
    endedAt: timed ? null : now,
    status: Object.fromEntries(
      statusKeys.map((k) => [k, statusValue(s, k, now)]),
    ),
    coefficient: coefficient(s, now),
    plans: [
      ...new Set([
        ...s.plans.filter((p) => p.active && !p.scope).map((p) => p.id),
        ...planActionIds(s, now),
        ...s.days
          .filter(
            (d) =>
              d.date === dateKey(now) &&
              d.enabled &&
              !s.plans.find((p) => p.id === d.planId)?.scope,
          )
          .map((d) => d.planId),
      ]),
    ],
  };
  for (const m of s.messages) if (m.cardId === id) m.read = true;
  s.actions.push(a);
  return a.id;
}
export function pause(s: State, id: string, now: number) {
  const a = s.actions.find((a) => a.id === id);
  if (!a || a.endedAt !== null) throw Error("行动已结束");
  if (a.runningSince === null) a.runningSince = now;
  else {
    a.elapsed += Math.max(0, now - a.runningSince);
    a.runningSince = null;
  }
}
export function freeze(s: State, id: string, now: number) {
  const a = s.actions.find((a) => a.id === id);
  if (!a) throw Error("找不到行动");
  if (a.endedAt !== null) return;
  a.elapsed = elapsed(a, now) * 1000;
  a.runningSince = null;
  a.endedAt = now;
}
export function rollDays(s: State, now: number) {
  const current = dateKey(now),
    last = s.days.at(-1)?.date;
  const d = new Date((last || dateKey(s.createdAt)) + "T12:00:00");
  if (last) d.setDate(d.getDate() + 1);
  const p = s.plans.find((p) => p.id === s.dailyPlan && p.active && !p.scope);
  let guard = 0;
  while (
    dateKey(d.getTime()) <= current &&
    guard++ < planSafetyLimits.cycleIterations
  ) {
    s.days.push({
      date: dateKey(d.getTime()),
      target: p?.target || planRules.legacyDailyTarget,
      mode: p?.mode || "score",
      requirements: structuredClone(p?.cards || []),
      planId: p?.id || "",
      enabled: !!p,
    });
    d.setDate(d.getDate() + 1);
  }
  ensurePlanCycles(s, now);
  syncPlanMessages(s, now);
}
export function progress(s: State, p: State["plans"][number], now: number) {
  if (p.scope) return planProgress(s, p, now);
  const rows = s.entries.filter(
    (e) =>
      e.plans.includes(p.id) &&
      periodKey(e.startedAt, p.period) === periodKey(now, p.period) &&
      e.counted,
  );
  if (p.mode === "score") {
    const raw = rows.reduce((n, e) => n + e.score, 0);
    return {
      value: Math.min(raw, p.target),
      target: p.target,
      done: raw >= p.target,
    };
  }
  const needed = p.cards.filter((r) =>
    s.cards.some((c) => c.id === r.id && c.state !== "abandoned"),
  );
  const value = needed.reduce(
      (n, r) =>
        n + Math.min(r.target, rows.filter((e) => e.cardId === r.id).length),
      0,
    ),
    target = needed.reduce((n, r) => n + r.target, 0);
  return { value, target, done: target > 0 && value >= target };
}
type ExecutionResult = {
  level: number;
  byPeriod: { day: number; week: number; month: number };
  streak: number;
  loss: number;
};
const executionCache = new WeakMap<
  State,
  { at: number; next: number; result: ExecutionResult }
>();
export function execution(s: State, now: number) {
  const prior = executionCache.get(s);
  if (
    Object.isFrozen(s.entries) &&
    prior &&
    now >= prior.at &&
    now < prior.next
  )
    return prior.result;
  let next = Infinity;
  for (const e of s.entries)
    if (e.endedAt > now) next = Math.min(next, e.endedAt);
  for (const c of s.planCycles) {
    if (c.start > now) next = Math.min(next, c.start);
    if (c.startsAt > now) next = Math.min(next, c.startsAt);
  }
  for (const d of s.days) {
    const at = new Date(d.date + "T00:00:00").getTime();
    if (at > now) next = Math.min(next, at);
  }
  const byPeriod = { day: 0, week: 0, month: 0 },
    awarded = new Set<string>();
  for (const event of executionCycles(s, now)) {
    if (event.at > now) next = Math.min(next, event.at);
    const key = event.period + ":" + event.key;
    if (!event.done || event.at > now || awarded.has(key)) continue;
    awarded.add(key);
    byPeriod[event.period] += planReward[event.period];
  }
  const result = {
    level: byPeriod.day + byPeriod.week + byPeriod.month,
    byPeriod,
    streak: 0,
    loss: 0,
  };
  if (Object.isFrozen(s.entries))
    executionCache.set(s, { at: now, next, result });
  return result;
}
export const roundedMinutes = (seconds: number) => Math.round(seconds / 60);
export interface Finish {
  seconds: number;
  quantity: number;
  rating: number;
  counted: boolean;
  note: string;
}
export function settle(
  s: State,
  id: string,
  input: Finish,
  context: RuleContext,
): Entry {
  const { now } = context;
  const prior = s.entries.find((e) => e.id === id);
  if (prior) return prior;
  const a = s.actions.find((a) => a.id === id);
  if (!a || a.endedAt === null) throw Error("请先结束计时");
  if (
    !ratings.includes(input.rating) ||
    !Number.isFinite(input.seconds) ||
    input.seconds < 0 ||
    input.seconds > actionRules.maxSeconds ||
    !Number.isInteger(input.quantity) ||
    input.quantity < 0 ||
    input.quantity > actionRules.maxQuantity ||
    input.note.length > textLimits.note
  )
    throw Error("请检查时长、数量与评价");
  const c = a.card,
    timed = ["duration", "timed"].includes(c.method),
    date = dateKey(a.startedAt);
  if (
    c.method !== "instant" &&
    !(a.reported && c.method === "quantity") &&
    elapsed(a, now) < actionRules.minElapsedSeconds
  )
    throw Error("当前任务未满一分钟，结束视为放弃行动");
  const seconds = timed ? roundedMinutes(input.seconds) * 60 : 0;
  if (c.method === "quantity" && input.quantity === 0) {
    s.actions = s.actions.filter((x) => x.id !== id);
    throw Error("零时长／数量请取消行动");
  }
  const ratio =
    c.method === "duration"
      ? Math.min(1, seconds / (Math.round(c.minutes) * 60))
      : c.method === "timed"
        ? seconds / 60
        : c.method === "quantity"
          ? input.quantity
          : 1;
  const effectRatio =
    timed && seconds === 0
      ? 0
      : c.method === "duration"
        ? ratio
        : c.method === "timed"
          ? seconds / 60
          : c.method === "quantity"
            ? input.quantity
            : 1;
  const e: Entry = {
    id,
    cardId: c.id,
    name: c.name,
    method: c.method,
    startedAt: a.startedAt,
    endedAt: a.endedAt,
    date,
    seconds,
    measured: Math.round(elapsed(a, now)),
    ...(a.reported ? { reported: true as const } : {}),
    quantity: c.method === "quantity" ? input.quantity : 0,
    counted: input.counted && (!timed || seconds > 0),
    rating: input.rating,
    coefficient: a.coefficient,
    note: input.note,
    score: input.counted && (!timed || seconds > 0) ? c.score : 0,
    plans: a.plans,
    rewards: [],
    effects: [],
    values: [],
    legacy: false,
  };
  for (const r of c.rewards) {
    const attr = s.attributes.find((x) => x.id === r.id),
      requested = Math.round(
        Math.max(0, Math.round(r.amount)) *
          ratio *
          a.coefficient *
          input.rating,
      );
    if (!attr || !attrAllowed(s, attr, context)) {
      e.rewards.push({
        id: r.id,
        name: attr?.name || "已移除属性",
        before: attr?.earned || 0,
        after: attr?.earned || 0,
        requested,
        actual: 0,
        reason: "属性未启用或已锁定",
      });
      continue;
    }
    const used = attr.daily[date] || 0,
      actual = Math.min(requested, Math.max(0, rules.dailyExperience - used)),
      before = attr.earned;
    attr.earned += actual;
    attr.daily[date] = used + actual;
    e.rewards.push({
      id: r.id,
      name: attr.name,
      before,
      after: attr.earned,
      requested,
      actual,
      reason: actual < requested ? "已裁减每日上限" : "",
    });
  }
  for (const r of c.effects) {
    if (!statusKeys.includes(r.id as (typeof statusKeys)[number])) continue;
    const k = r.id as (typeof statusKeys)[number],
      v = s.states[k],
      previousBase = v.base,
      before = statusValue(s, k, now),
      delta = Math.round(Math.round(r.amount) * effectRatio * input.rating);
    if (timed && seconds === 0) {
      e.effects.push({
        id: k,
        name: k,
        before,
        after: before,
        requested: 0,
        actual: 0,
        reason: "",
      });
      continue;
    }
    if (c.sleep && k === "sleep") {
      v.base = clamp(Math.round(Math.round(r.amount) * input.rating));
      v.offset = 0;
      v.expires = 0;
      s.sleepCycle = sleepCycle(now);
    } else {
      v.base = clamp(Math.round(v.base + delta));
      if (k === "sleep") s.sleepCycle = sleepCycle(now);
    }
    const after = statusValue(s, k, now),
      actual = after - before,
      applied = v.base - previousBase;
    e.effects.push({
      id: k,
      name: k,
      before,
      after,
      requested: delta,
      actual,
      ...(applied !== actual ? { applied } : {}),
      reason: c.sleep && k === "sleep" ? "新睡眠基础" : "",
    });
  }
  for (const r of c.values) {
    const v = s.meters.find((v) => v.id === r.id);
    if (!v) {
      e.values.push({
        id: r.id,
        name: "已删除数值",
        before: 0,
        after: 0,
        requested: Math.round(
          Math.round(r.amount) * effectRatio * input.rating,
        ),
        actual: 0,
        reason: "绑定已失效",
      });
      continue;
    }
    const previousValue = v.value,
      before = Math.round(previousValue),
      requested = Math.round(Math.round(r.amount) * effectRatio * input.rating);
    v.precision = 0;
    const bounds = meterBounds(v),
      next = clamp(before + requested, bounds.min, bounds.max);
    const reason = next !== before + requested ? "已达数值边界" : "";
    v.value = next;
    const actual = next - before,
      applied = next - previousValue;
    e.values.push({
      id: v.id,
      name: v.name,
      before,
      after: v.value,
      requested,
      actual,
      ...(applied !== actual ? { applied } : {}),
      reason,
    });
  }
  const live = s.cards.find((x) => x.id === c.id);
  if (live && e.counted) {
    live.count++;
    if (live.life === "consumable" && live.count >= live.uses)
      archiveCard(s, live);
  }
  if (c.sleep && c.rest && (!timed || seconds > 0)) {
    const d = new Date(now);
    d.setHours(statusRules.sleepResetHour, 0, 0, 0);
    if (d.getTime() <= now) d.setDate(d.getDate() + 1);
    s.restUntil = d.getTime();
  }
  s.firstActionGuide = false;
  s.entries.push(e);
  s.actions = s.actions.filter((x) => x.id !== id);
  rollDays(s, now);
  return e;
}

/** Compensate the recorded writes on today's values and remove their source entry. */
export function deleteEntry(s: State, id: string, now: number) {
  const e = s.entries.find((entry) => entry.id === id);
  if (!e) return false;
  for (const r of e.rewards) {
    const attr = s.attributes.find((a) => a.id === r.id);
    if (!attr || r.actual <= 0) continue;
    attr.earned = Math.max(0, attr.earned - r.actual);
    const used = attr.daily[e.date];
    if (used !== undefined) {
      if (used > r.actual) attr.daily[e.date] = used - r.actual;
      else delete attr.daily[e.date];
    }
  }
  for (const r of e.effects.slice().reverse()) {
    const key = r.id as (typeof statusKeys)[number];
    const amount = r.applied ?? r.actual;
    if (amount && statusKeys.includes(key))
      s.states[key].base = clamp(s.states[key].base - amount);
  }
  for (const r of e.values.slice().reverse()) {
    const meter = s.meters.find((m) => m.id === r.id);
    const amount = r.applied ?? r.actual;
    if (!meter || !amount) continue;
    const { min, max } = meterBounds(meter);
    meter.value = clamp(meter.value - amount, min, max);
  }

  const card = s.cards.find((c) => c.id === e.cardId);
  if (e.counted && card && card.count > 0 && e.endedAt >= card.statsSince) {
    // Changing a repeat card to consumable also resets its count. Only the
    // most recent counted settlements can belong to the current tally.
    const settlements = s.entries.filter(
      (row) =>
        row.cardId === card.id && row.counted && row.endedAt >= card.statsSince,
    );
    if (settlements.slice(-card.count).includes(e)) card.count--;
  }

  s.entries = s.entries.filter((entry) => entry !== e);
  const cycles = e.counted
    ? s.planCycles.filter(
        (c) =>
          c.doneAt !== undefined &&
          e.plans.includes(c.planId) &&
          e.startedAt >= c.startsAt &&
          e.startedAt < c.end,
      )
    : [];
  if (cycles.length) {
    const indexed = {
      ...s,
      entries: Object.freeze([...s.entries]) as State["entries"],
    };
    for (const cycle of cycles)
      if (!cycleProgress(indexed, cycle).done) delete cycle.doneAt;
  }
  syncPlanMessages(s, now);
  return true;
}
export function correctStatus(
  s: State,
  values: Partial<Record<(typeof statusKeys)[number], number>>,
  now: number,
) {
  for (const k of statusKeys) {
    if (values[k] === undefined) continue;
    const next = values[k]!;
    if (
      !Number.isInteger(next) ||
      next < statusRules.min ||
      next > statusRules.max
    )
      throw Error("状态须为0到100的整数");
    const before = statusValue(s, k, now);
    s.states[k].offset = next - s.states[k].base;
    s.states[k].expires = now + statusRules.correctionDurationMs;
    if (k === "sleep") s.sleepCycle = sleepCycle(now);
    s.changes.push({
      id: uid(),
      at: now,
      kind: "状态纠正",
      name: k,
      before,
      after: next,
      note: "24小时偏移",
    });
  }
}
function archiveCard(s: State, card: Card) {
  if (card.state === "archived") return;
  const base = card.name,
    names = new Set(
      s.cards
        .filter((c) => c.id !== card.id && c.state === "archived")
        .map((c) => c.name),
    );
  let name = base,
    sequence = 1;
  while (names.has(name)) {
    const suffix = `（${++sequence}）`;
    name = base.slice(0, 200 - suffix.length) + suffix;
  }
  card.archiveBaseName = base;
  card.name = name;
  card.state = "archived";
}
export function copyCard(s: State, id: string, now: number): Card {
  const source = s.cards.find((c) => c.id === id);
  if (!source) throw Error("找不到卡牌");
  const copy: Card = {
    ...structuredClone(source),
    id: uid(),
    name:
      source.state === "archived"
        ? source.archiveBaseName || source.name
        : source.name,
    archiveBaseName: undefined,
    count: 0,
    state: "active",
    createdAt: now,
    favorite: false,
    changes: [],
    statsSince: now,
  };
  s.cards.push(copy);
  return copy;
}
export function changeCardState(
  s: State,
  id: string,
  type: "abandon" | "archive" | "restore" | "reset",
  now: number,
) {
  const card = s.cards.find((c) => c.id === id);
  if (!card) throw Error("找不到卡牌");
  if (s.actions.some((a) => a.card.id === id))
    throw Error("请先保存或取消这张卡牌的当前行动");
  if (card.state === "archived" && type !== "archive")
    throw Error("归档卡牌不能恢复或重复使用，请复制为新卡牌");
  if (type === "abandon") card.state = "abandoned";
  else if (type === "archive") archiveCard(s, card);
  else {
    card.state = "active";
    card.favorite = false;
    if (type === "reset") {
      card.count = 0;
      card.statsSince = now;
    }
  }
}
export function addCardFromTemplate(s: State, template: Card, context: RuleContext) {
  saveCard(s, {
    ...structuredClone(template),
    id: uid(),
    createdAt: context.now,
    count: 0,
    statsSince: context.now,
  }, context);
}

export function saveCard(s: State, value: Card, context: RuleContext) {
  const { now } = context;
  const existing = s.cards.find((x) => x.id === value.id);
  const knownImage =
    value.customArt &&
    [...s.cards, ...s.cardTemplates].some(
      (c) => c.customArt === value.customArt,
    );
  if (
    value.customArt &&
    value.customArt !== existing?.customArt &&
    !knownImage &&
    !(context.member || context.trial)
  )
    throw Error("上传卡牌图片为会员功能");
  checkTextLength(value.unit, textLimits.unit, "计数单位", existing?.unit);
  const timeError = timeWindowError(value.timeWindows || []);
  if (timeError) throw Error(timeError.message);
  const c = CardSchema.parse({
    ...value,
    minutes: Math.round(value.minutes),
    rewards: value.rewards.map((r) => ({ ...r, amount: Math.round(r.amount) })),
    effects: value.effects.map((r) => ({ ...r, amount: Math.round(r.amount) })),
    values: value.values.map((r) => ({ ...r, amount: Math.round(r.amount) })),
  });
  if (c.rewards.some((r) => r.amount < 0)) throw Error("属性经验不能为负数");
  if (
    new Set(c.rewards.map((x) => x.id)).size !== c.rewards.length ||
    new Set(c.effects.map((x) => x.id)).size !== c.effects.length ||
    new Set(c.values.map((x) => x.id)).size !== c.values.length
  )
    throw Error("同一对象不能重复绑定");
  c.timeWindows = c.timeWindows
    .filter((w) => w.start && w.end)
    .sort((a, b) => a.start.localeCompare(b.start));
  syncPlanCardDuration(s, c, now);
  const previous = s.cards.find((x) => x.id === c.id);
  if (previous && c.name !== previous.name) delete c.archiveBaseName;
  const old = s.cards.find((x) => x.id === c.id);
  if (old) {
    c.count = old.count;
    c.state = old.state;
    c.statsSince = old.statsSince;
    c.order = old.order;
    c.favorite = old.favorite;
    if (JSON.stringify(old) !== JSON.stringify(c)) {
      c.changes = [...old.changes, { at: now, description: "更新卡牌配置" }];
      if (old.life === "repeat" && c.life === "consumable") c.count = 0;
    }
    s.cards = s.cards.map((x) => (x.id === c.id ? c : x));
  } else {
    s.cards.push(c);
  }
  if (c.category && !s.categories.includes(c.category))
    s.categories.push(c.category);
}
