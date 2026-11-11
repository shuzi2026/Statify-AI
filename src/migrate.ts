import { paymentRegion } from "./payments/deployment";
import { decodeBackup } from "./storage-format";
import { z } from "zod";
import {
  fresh,
  newCard,
  StateSchema,
  type State,
  type Card,
  uid,
  statusKeys,
} from "./model";
import { clamp, coefficient, dateKey, rollDays } from "./engine";
import { validDate, planBounds, setPlanMode } from "./planning";
const obj = z.record(z.string(), z.unknown());
const legacySchema = z
  .object({
    profile: obj.optional(),
    attributes: z.array(obj).default([]),
    events: z.array(obj).default([]),
    customValues: z.array(obj).default([]),
    status: obj.optional(),
    log: z.array(obj).default([]),
    activeEvent: obj.nullable().optional(),
  })
  .passthrough();
const str = (v: unknown, f = "") =>
  typeof v === "string" ? v.slice(0, 200) : f;
const n = (v: unknown, f = 0) =>
  typeof v === "number" && Number.isFinite(v) ? clamp(v, -1e12, 1e12) : f;
const ts = (v: unknown, f: number) =>
  typeof v === "number" && v > 0
    ? v
    : typeof v === "string" && Number.isFinite(Date.parse(v))
      ? Date.parse(v)
      : f;
const records = (v: unknown) =>
  Array.isArray(v)
    ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[])
    : [];
export function migrate(raw: unknown, now = Date.now()): State {
  const old = legacySchema.parse(raw);
  if (
    !Array.isArray(old.events) ||
    (!("profile" in old) &&
      old.attributes.length === 0 &&
      old.events.length === 0)
  )
    throw Error("不是可识别的0.1存档");
  const s = fresh(now, paymentRegion);
  s.profile = {
    name: str(old.profile?.name, "朋友"),
    age: clamp(n(old.profile?.age, 25), 1, 120),
    onboarded: true,
  };
  s.legacy = raw;
  s.migrationNotice = true;
  const used = new Set<string>();
  const unique = (value: unknown) => {
    let id = str(value) || uid();
    if (used.has(id))
      throw Error("旧存档有重复身份，原件已保留，请先修复重复ID");
    used.add(id);
    return id;
  };
  s.attributes = old.attributes.map((a, i) => ({
    id: unique(a.id),
    name: str(a.name, "未命名属性"),
    initial: clamp(n(a.value), 0, 100),
    earned: Math.max(0, n(a.score)),
    slot: i < 6 ? i : -1,
    daily: {},
    original: i < 4,
  }));
  if (!s.attributes.length) s.attributes = fresh(now, paymentRegion).attributes;
  s.meters = old.customValues.map((v) => ({
    id: unique(v.key),
    name: str(v.name, "未命名数值"),
    unit: v.mode === "percent" ? "%" : "",
    value: n(v.value),
    precision: 2,
    min: v.mode === "unlimited" ? null : 0,
    max:
      v.mode === "percent" ? 100 : v.mode === "custom" ? n(v.max, 100) : null,
  }));
  const map: Record<string, { id: string; sign: number }> = {
    mood: { id: "mood", sign: 1 },
    health: { id: "comfort", sign: 1 },
    fatigue: { id: "vitality", sign: -1 },
    stress: { id: "stress", sign: 1 },
  };
  for (const [key, m] of Object.entries(map)) {
    if (old.status?.[key] !== undefined)
      s.states[m.id as (typeof statusKeys)[number]].base = clamp(
        Math.round(
          m.sign === 1 ? n(old.status[key], 50) : 100 - n(old.status[key], 50),
        ),
      );
  }
  s.cards = old.events.map((v, i) => {
    const method = ["instant", "duration", "timed", "quantity"].includes(
      str(v.type),
    )
      ? (str(v.type) as Card["method"])
      : "instant";
    const c: Card = {
      ...newCard(now),
      id: unique(v.id),
      name: str(v.name, "未命名卡牌"),
      method,
      minutes: clamp(n(v.duration, 25), 1, 1440),
      unit: str(v.unit, "个"),
      category: str(v.category, "生活"),
      favorite: v.category === "common",
      order: n(v.sortOrder, i),
      createdAt: now,
      life: v.frequency === "once" ? "consumable" : "repeat",
      uses: 1,
      count: Math.max(0, Math.floor(n(v.completionCount))),
      state: "active",
      evaluate: v.evaluate === true,
      settle: v.settle !== false,
      score: clamp(Math.round(n(v.energyCost, 1)), 0, 3),
      cap: Math.max(0, Math.floor(n(v.dailyLimit))),
      timeStart: /^([01]\d|2[0-3]):[0-5]\d$/.test(str(v.timeStart))
        ? str(v.timeStart)
        : "",
      timeEnd: /^([01]\d|2[0-3]):[0-5]\d$/.test(str(v.timeEnd))
        ? str(v.timeEnd)
        : "",
      rewards: records(v.rewards).map((r) => ({
        id: str(r.attrId),
        amount: Math.max(0, n(r.points)),
      })),
      effects: records(v.statusEffects)
        .filter((r) => map[str(r.key)])
        .map((r) => ({
          id: map[str(r.key)].id,
          amount: n(r.delta) * map[str(r.key)].sign,
        })),
      values: records(v.valueEffects).map((r) => ({
        id: str(r.valueId),
        amount: n(r.delta),
      })),
    };
    if (c.life === "consumable" && c.count >= 1) c.state = "archived";
    return c;
  });
  s.categories = [...new Set(s.cards.map((c) => c.category))];
  s.entries = old.log.map((l, i) => {
    const start = ts(l.startTime, ts(l.time, now)),
      end = ts(l.endTime, start);
    return {
      id: "legacy-" + i,
      cardId: str(l.eventId, "legacy"),
      name: str(l.eventName, "旧版行动"),
      method: ["instant", "duration", "timed", "quantity"].includes(str(l.type))
        ? (str(l.type) as Card["method"])
        : "instant",
      startedAt: start,
      endedAt: Math.max(start, end),
      date: dateKey(start),
      seconds: Math.max(0, n(l.minutes) * 60),
      measured: Math.max(0, n(l.minutes) * 60),
      quantity: Math.max(0, n(l.quantity)),
      counted: !l.earlyEnd,
      rating: 1,
      coefficient: n(l.coeff, 1),
      note: str(l.note || l.comment || l.feeling),
      score: 0,
      plans: [],
      rewards: [],
      effects: [],
      values: [],
      legacy: true,
    };
  });
  if (old.activeEvent) {
    const v = old.activeEvent,
      c = s.cards.find((c) => c.id === v.eventId);
    if (c && ["duration", "timed"].includes(c.method)) {
      s.actions.push({
        id: uid(),
        card: structuredClone(c),
        startedAt: ts(v.startedAt, now),
        runningSince: ts(v.startedAt, now),
        elapsed: 0,
        endedAt: null,
        status: Object.fromEntries(
          statusKeys.map((k) => [k, s.states[k].base]),
        ),
        coefficient: coefficient(s, now),
        plans: [],
      });
    }
  }
  rollDays(s, now);
  return StateSchema.parse(s);
}
export function parseImport(raw: unknown, now = Date.now()) {
  raw = decodeBackup(raw);
  if (
    raw &&
    typeof raw === "object" &&
    "version" in raw &&
    (raw.version === "0.2.1" || raw.version === "0.2.2")
  )
    return validateState(raw);
  if (raw && typeof raw === "object" && "version" in raw)
    throw Error("不支持此版本存档，请使用对应版本导出");
  if (paymentRegion === "global")
    throw Error("旧版存档属于国内区，请在国内版本恢复");
  return migrate(raw, now);
}
export function validateState(raw: unknown) {
  const s = StateSchema.parse(raw);
  if (s.region !== paymentRegion)
    throw Error("存档所属区域与此版本不一致，国内区与海外区存档独立");
  for (const list of [
    s.cards,
    s.cardTemplates,
    s.attributes,
    s.meters,
    s.actions,
    s.entries,
    s.plans,
    s.planCycles,
    s.messages,
    s.changes,
  ]) {
    if (new Set(list.map((x) => x.id)).size !== list.length)
      throw Error("存档有重复身份，无法导入");
  }
  for (const p of s.plans) {
    if (!p.scope) continue;
    if (!p.anchor || !validDate(p.anchor)) throw Error("计划日期无效");
    if (
      new Set(p.cards.map((r) => r.id)).size !== p.cards.length ||
      new Set((p.slots || []).map((r) => r.id)).size !== (p.slots || []).length
    )
      throw Error("计划卡牌或安排重复");
    for (const slot of p.slots || []) {
      const r = p.cards.find((r) => r.id === slot.cardId);
      if (
        !r ||
        (p.slots || []).filter((x) => x.cardId === slot.cardId).length >
          r.target
      )
        throw Error("时间安排与计划次数不一致");
      if (p.scope === "once") {
        const b = planBounds(p, Date.now());
        const t = new Date(slot.day + "T00:00:00").getTime();
        if (!validDate(slot.day) || t < b.start || t >= b.end)
          throw Error("安排日期不在计划范围内");
      } else if (
        !/^\d+$/.test(slot.day) ||
        Number(slot.day) < 1 ||
        Number(slot.day) >
          (p.period === "week" ? 7 : p.period === "month" ? 31 : 1)
      )
        throw Error("周期日期无效");
    }
  }
  for (const c of s.planCycles)
    if (c.start >= c.end || c.startsAt < c.start || c.startsAt >= c.end)
      throw Error("计划周期记录无效");
  if (s.actions.some((a) => s.entries.some((e) => e.id === a.id)))
    throw Error("行动同时出现在待结算与已完成记录中");
  const slots = s.attributes.filter((a) => a.slot >= 0).map((a) => a.slot);
  if (new Set(slots).size !== slots.length) throw Error("属性槽位冲突");
  if (
    s.actions.filter((a) =>
      ["timed", "duration", "quantity"].includes(a.card.method),
    ).length > 1
  )
    throw Error("存档包含多个计时行动");
  for (const v of s.meters) {
    if (v.min !== null && v.max !== null && v.min > v.max)
      throw Error("数值边界错误");
  }
  if (new Set(s.days.map((d) => d.date)).size !== s.days.length)
    throw Error("日期记录冲突");
  s.days.sort((a, b) => a.date.localeCompare(b.date));
  if (raw && typeof raw === "object" && !("planMode" in raw))
    setPlanMode(s, "cards", Date.now());
  return s;
}
