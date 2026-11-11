import { planRules } from "../shared/rules/plans";
import { planChoiceSlot } from "./local-data/registered-storage";
import type { State, Plan, PlanCycle } from "./model";
import {
  bounds,
  ensurePlanCycles,
  planBounds,
  planDate,
  slotStamp,
} from "./planning";

export type PlanApplyChoice = Record<Plan["period"], boolean>;
export const allPlanPeriods: Plan["period"][] = ["day", "week", "month"];
const duration = planRules.choiceMemoryMs;
type Remembered = { at: number; until: number; choice: PlanApplyChoice };
const memory = new Map<string, Remembered>();
export function readPlanApplyChoice(
  s: State,
  now = Date.now(),
): PlanApplyChoice | undefined {
  const entry = planChoiceSlot(s),
    cached = memory.get(entry.identity);
  let persisted: Remembered | undefined;
  try {
    const raw = entry.read().value;
    if (raw) persisted = JSON.parse(raw);
  } catch {}
  const valid = (value: Remembered | undefined): value is Remembered =>
    !!value &&
    Number.isFinite(value.at) &&
    value.until === value.at + duration &&
    now >= value.at &&
    now < value.until &&
    !!value.choice &&
    allPlanPeriods.every((p) => typeof value.choice[p] === "boolean");
  // A quota failure can leave an older readable value on disk. Prefer the
  // newest valid answer, retaining this page's answer on equal timestamps.
  const value =
    valid(persisted) && (!valid(cached) || persisted.at > cached.at)
      ? persisted
      : valid(cached)
        ? cached
        : undefined;
  return value ? { ...value.choice } : undefined;
}
export function rememberPlanApplyChoice(
  s: State,
  choice: PlanApplyChoice,
  at = Date.now(),
) {
  const value = { at, until: at + duration, choice: { ...choice } };
  const entry = planChoiceSlot(s);
  memory.set(entry.identity, value);
  try {
    entry.write(JSON.stringify(value));
  } catch {
    /* Still remember within this app session. */
  }
}
export class PlanApplyRequired extends Error {
  constructor(
    readonly periods: Plan["period"][],
    readonly saveCreatedAt: number,
  ) {
    super("请选择是否应用到当前周期");
  }
}
const shape = (p: Plan) =>
  JSON.stringify([
    p.scope,
    p.period,
    p.anchor,
    p.startsAt,
    p.mode,
    p.target,
    p.cards,
    p.active,
    p.draft,
    !!p.timeline,
    p.slots || [],
  ]);
const current = (c: PlanCycle, now: number) =>
  c.start <= now && c.startsAt <= now && now < c.end;

/** Run inside the save transaction. A missing answer aborts the whole write before asking outside IndexedDB. */
export function withPlanApplyChoice<T>(
  s: State,
  change: (s: State) => T,
  now = Date.now(),
  choice?: PlanApplyChoice,
): T {
  if (new Date(now).getHours() < planRules.lateEditHour) {
    const plans = s.plans,
      result = change(s);
    if (
      plans !== s.plans &&
      s.planCycles.some(
        (c) => c.end <= now && c.end + 86400000 > now && c.timeline,
      )
    )
      validateCurrentReservations(s, now);
    return result;
  }
  ensurePlanCycles(s, now);
  const before = new Map(s.plans.map((p) => [p.id, shape(p)])),
    cycles = structuredClone(s.planCycles.filter((c) => current(c, now))),
    messages = s.messages.map((m) => ({ ...m }));
  const result = change(s);
  const changed = s.plans.filter(
    (p) => p.scope === "repeat" && before.get(p.id) !== shape(p),
  );
  const affected = changed.filter(
    (p) =>
      cycles.some((c) => c.planId === p.id && c.scope === "repeat") ||
      (!p.draft &&
        p.active &&
        (p.startsAt || Infinity) <= now &&
        planBounds(p, now).start <= now),
  );
  if (!affected.length) {
    if (changed.length) validateCurrentReservations(s, now);
    return result;
  }
  if (!choice)
    throw new PlanApplyRequired(
      [...new Set(affected.map((p) => p.period))],
      s.createdAt,
    );
  const retained = new Set(
    affected.filter((p) => !choice[p.period]).map((p) => p.id),
  );
  if (!retained.size) {
    validateCurrentReservations(s, now);
    return result;
  }
  const originals = new Map(
    cycles.filter((c) => retained.has(c.planId)).map((c) => [c.id, c]),
  );
  s.planCycles = s.planCycles
    .filter(
      (c) => !retained.has(c.planId) || !current(c, now) || originals.has(c.id),
    )
    .map((c) => originals.get(c.id) || c);
  for (const c of originals.values())
    if (!s.planCycles.some((value) => value.id === c.id)) s.planCycles.push(c);
  for (const p of s.plans)
    if (retained.has(p.id) && !cycles.some((c) => c.planId === p.id)) {
      const next = bounds(p.period, now).end;
      p.startsAt = next;
      p.anchor = planDate(next);
    }
  const oldMessages = new Map(
    messages.filter((m) => retained.has(m.planId)).map((m) => [m.id, m]),
  );
  s.messages = s.messages
    .filter((m) => !retained.has(m.planId) || oldMessages.has(m.id))
    .map((m) => oldMessages.get(m.id) || m);
  validateCurrentReservations(s, now);
  return result;
}

function validateCurrentReservations(s: State, now: number) {
  const intervals: {
    start: number;
    end: number;
    slot: string;
    plan: string;
    cycle: number;
  }[] = [];
  for (const c of s.planCycles.filter(
    (c) => c.start <= now && c.end + 86400000 > now && c.timeline,
  )) {
    const p = s.plans.find((p) => p.id === c.planId);
    if (!p) continue;
    for (const slot of c.slots || []) {
      if (!slot.time || slot.configured === false || !slot.minutes) continue;
      const start = slotStamp(
          { ...p, period: c.period, scope: c.scope },
          slot,
          c.start,
        ),
        end = start + slot.minutes * 60000;
      if (start >= c.startsAt && end > now)
        intervals.push({
          start,
          end,
          slot: slot.id,
          plan: c.planId,
          cycle: c.start,
        });
    }
  }
  // A retained task can run past midnight into tomorrow's newly edited template.
  const latest = intervals.reduce((end, slot) => Math.max(end, slot.end), now);
  for (const p of s.plans.filter(
    (p) => p.scope && p.active && !p.draft && p.timeline,
  )) {
    let b =
      p.scope === "once"
        ? planBounds(p, now)
        : bounds(
            p.period,
            Math.max(bounds(p.period, now).end, p.startsAt || 0),
          );
    while (b.start > now && b.start < latest) {
      for (const slot of p.slots || []) {
        if (!slot.time || slot.configured === false || !slot.minutes) continue;
        const start = slotStamp(p, slot, b.start);
        if (start > now && start < latest && start >= (p.startsAt || 0))
          intervals.push({
            start,
            end: start + slot.minutes * 60000,
            slot: slot.id,
            plan: p.id,
            cycle: b.start,
          });
      }
      if (p.scope === "once") break;
      b = bounds(p.period, b.end);
    }
  }
  intervals.sort((a, b) => a.start - b.start);
  for (let i = 0; i < intervals.length; i++)
    for (
      let j = i + 1;
      j < intervals.length && intervals[j].start < intervals[i].end;
      j++
    )
      if (
        intervals[i].slot !== intervals[j].slot ||
        intervals[i].plan !== intervals[j].plan ||
        intervals[i].cycle !== intervals[j].cycle
      )
        throw Error("本期保留的安排与新时间冲突，请调整时间后重试");
}
export function hasUpcomingPlanChanges(s: State, p: Plan, now = Date.now()) {
  const c = s.planCycles.find((c) => c.planId === p.id && current(c, now));
  if (!c) return false;
  return (
    JSON.stringify([c.mode, c.target, c.cards, !!c.timeline, c.slots || []]) !==
    JSON.stringify([p.mode, p.target, p.cards, !!p.timeline, p.slots || []])
  );
}
