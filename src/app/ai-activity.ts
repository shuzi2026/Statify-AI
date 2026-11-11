import type { AiActivityOperation } from "../../shared/ai-chat";
import { dateKey, growth, progress, statusValue } from "../engine";
import { isManualMeterChange } from "../meters";
import { statusKeys, statusNames, type Entry, type State } from "../model";
import { planBounds, planDate, slotStamp } from "../planning";
import { findAiCards } from "./ai-local-operation";
import { inferShoppingKind, shoppingPrice } from "../../shared/shopping-demo";

type Query = Extract<AiActivityOperation, { type: "read_activity" }>;
type Status = (typeof statusKeys)[number];
type Change = Entry["rewards"][number];
const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase();
const includes = (value: string, text: string) => normalize(value).includes(normalize(text));
const englishStatus: Record<Status, string> = {
  mood: "Mood", vitality: "Vitality", stress: "Stress", comfort: "Comfort", sleep: "Sleep",
};
const englishAttribute: Record<string, string> = {
  "attr-body": "Physique", "attr-mem": "Memory", "attr-know": "Cognition", "attr-foc": "Focus",
};
const statusCorrection = /^(状态纠正|State correction)$/;
const views: Record<Query["view"], [string, string]> = {
  journal: ["行动日志", "Activity journal"],
  purchases: ["购买记录", "Purchase history"],
  growth: ["成长记录", "XP history"],
  attribute: ["属性成长记录", "Attribute XP history"],
  status: ["状态变化记录", "Status history"],
  check_ins: ["打卡记录", "Check-in history"],
  cards: ["卡牌", "Cards"],
  attributes: ["当前属性", "Current attributes"],
  current_status: ["当前状态", "Current statuses"],
  plans: ["计划进度", "Plan progress"],
  meters: ["自定义数值", "Custom meters"],
  meter_history: ["自定义数值历史", "Custom meter history"],
};

function dateRange(query: Pick<Query, "period" | "from" | "to">, now: number) {
  const { from, to, period } = query;
  if (from || to) {
    for (const day of [from, to]) {
      if (day && dateKey(new Date(day + "T12:00:00").getTime()) !== day)
        throw Error("日期无效，请重新指定查询日期。");
    }
    if (from && to && from > to) throw Error("开始日期不能晚于结束日期。");
    return [from, to];
  }
  const day = new Date(now);
  const today = dateKey(now);
  const shift = (days: number) => {
    const shifted = new Date(day);
    shifted.setDate(day.getDate() + days);
    return dateKey(shifted.getTime());
  };
  const sinceMonday = (day.getDay() + 6) % 7;
  switch (period) {
    case "all": return [null, null];
    case "today": return [today, today];
    case "yesterday": return [shift(-1), shift(-1)];
    case "this_week": return [shift(-sinceMonday), today];
    case "last_week": return [shift(-sinceMonday - 7), shift(-sinceMonday - 1)];
    case "this_month": return [shift(1 - day.getDate()), today];
    case "last_month": {
      const last = new Date(day.getFullYear(), day.getMonth(), 0, 12);
      return [dateKey(new Date(last.getFullYear(), last.getMonth(), 1, 12).getTime()), dateKey(last.getTime())];
    }
    case "recent": return [shift(-6), today];
  }
}

export function matchingEntries(state: State, name: string | null) {
  if (!name) return state.entries;
  const exact = state.cards.filter((card) => normalize(card.name) === normalize(name));
  const exactEntries = state.entries.filter((entry) => normalize(entry.name) === normalize(name));
  const cards = exact.length || exactEntries.length ? exact : findAiCards(state.cards, name);
  const ids = new Set(cards.map(({ id }) => id));
  for (const entry of exactEntries) ids.add(entry.cardId);
  return state.entries.filter((entry) => ids.has(entry.cardId) ||
    (!exact.length && !exactEntries.length && entry.purchase && [entry.purchase.title ?? "", state.cards.find((card) => card.id === entry.cardId)?.shopping?.kind ?? ""]
      .some((value) => includes(value, name) || (inferShoppingKind(name) !== undefined && inferShoppingKind(value) === inferShoppingKind(name)))) ||
    (!exact.length && !exactEntries.length && includes(entry.name, name)));
}

export type ActivityResult = {
  title: string;
  count: number;
  page: (offset: number, size: number) => string[];
};

export function readActivity(state: State, query: Query, now: number, chinese: boolean): ActivityResult {
  const t = (zh: string, en: string) => chinese ? zh : en;
  const statusName = (id: string) => t(statusNames[id as Status] ?? id, englishStatus[id as Status] ?? id);
  const attrName = (id: string, name: string) =>
    !chinese && /[\u3400-\u9fff]/.test(name) ? englishAttribute[id] ?? name : name;
  const [from, to] = dateRange(query, now);
  const inRange = (at: number) => {
    const day = dateKey(at);
    return (!from || day >= from) && (!to || day <= to);
  };
  const isHistory = ["journal", "purchases", "check_ins", "growth", "attribute", "status", "meter_history"].includes(query.view);
  const range = isHistory && (from || to) ? ` · ${from ?? "…"} – ${to ?? "…"}` : "";
  const title = t(...views[query.view]) + range;
  function result<T>(rows: T[], line: (row: T) => string): ActivityResult {
    return { title, count: rows.length, page: (offset, size) => rows.slice(offset, offset + size).map(line) };
  }
  const attribute = query.attribute;
  const matchesAttribute = (id: string, name: string) => !attribute ||
    [id, name, englishAttribute[id] ?? "", state.attributes.find((item) => item.id === id)?.name ?? ""]
      .some((label) => normalize(label) === normalize(attribute));
  const status = query.status;
  const stamp = (at: number) => `${dateKey(at)} ${new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  switch (query.view) {
    case "cards":
      return result(state.cards.filter((card) => !query.cardName || includes(card.name, query.cardName)), (card) =>
        JSON.stringify({ id: card.id, name: card.name, category: card.category, state: card.state,
          method: card.method, minutes: card.minutes, unit: card.unit, life: card.life, uses: card.uses,
          rewards: card.rewards, effects: card.effects, values: card.values,
          ...(card.shopping && { shopping: { kind: card.shopping.kind, url: card.shopping.url } }) }));
    case "attributes":
      return result(state.attributes.filter((item) => matchesAttribute(item.id, item.name)), (item) =>
        `${attrName(item.id, item.name)} · Lv. ${growth(item).level} · ${item.earned} XP`);
    case "current_status":
      return result(statusKeys.filter((id) => !status || id === status), (id) => `${statusName(id)} · ${statusValue(state, id, now)}`);
    case "plans":
      return result(state.plans, (plan) => {
        const current = progress(state, plan, now);
        const cycle = planBounds(plan, now);
        const schedule = (plan.slots ?? []).filter((slot) => slot.configured !== false);
        const cards = plan.cards.map(({ id, target, score }) => {
          const times = schedule.filter((slot) => slot.cardId === id).map((slot) => {
            const when = slotStamp(plan, slot, cycle.start);
            return `${planDate(when)}${slot.time ? " " + slot.time : ""}`;
          });
          const name = state.cards.find((card) => card.id === id)?.name ?? id;
          return `${name} × ${target}${plan.mode === "score" && score !== undefined ? t(` · ${score} 分/次`, ` · ${score} pts/use`) : ""}${times.length ? " · " + times.join(", ") : ""}`;
        });
        const scope = plan.scope === "once" ? t("一次性", "One-time") : t("重复", "Recurring");
        return [`${plan.name} · ${scope} · ${cycle.key} · ${current.value}/${current.target} · ${plan.active ? t("已启用", "Active") : t("未启用", "Inactive")}`, ...cards].join("\n");
      });
    case "meters":
      return result(state.meters.filter(({ name }) => !query.keyword || includes(name, query.keyword)), (meter) =>
        `${meter.name} · ${meter.value} ${meter.unit}`.trimEnd() +
        (meter.min !== null || meter.max !== null ? ` · ${meter.min ?? "…"} – ${meter.max ?? "…"}` : ""));
    case "meter_history": {
      const meterIds = new Set(state.meters.filter(({ name }) => !query.keyword || includes(name, query.keyword)).map(({ id }) => id));
      const matches = (id: string | undefined, name: string) => !query.keyword || (id !== undefined && meterIds.has(id)) || includes(name, query.keyword);
      const manual = state.changes.filter((change) => isManualMeterChange(change.kind) && inRange(change.at) && matches(change.objectId, change.name))
        .map(({ at, name, before, after }) => ({ at, name, before, after, source: t("手动调整", "Manual adjustment") }));
      const recorded = matchingEntries(state, query.cardName).filter((entry) => inRange(entry.endedAt))
        .flatMap((entry) => entry.values.filter(({ id, name }) => matches(id, name))
          .map(({ name, before, after }) => ({ at: entry.endedAt, name, before, after, source: entry.name })));
      return result([...manual, ...recorded].sort((a, b) => b.at - a.at), ({ at, name, before, after, source }) =>
        `${stamp(at)} · ${name} · ${before} → ${after} · ${source}`);
    }
  }

  const entries = matchingEntries(state, query.cardName)
    .filter((entry) => inRange(entry.endedAt) &&
      (query.view !== "purchases" || !!entry.purchase) &&
      (!query.keyword || includes(entry.note, query.keyword) || includes(entry.name, query.keyword) ||
        (entry.purchase && [entry.purchase.title ?? "", entry.purchase.merchant, entry.purchase.orderId, entry.purchase.url,
          state.cards.find((card) => card.id === entry.cardId)?.shopping?.kind ?? ""]
          .some((value) => includes(value, query.keyword!) || (inferShoppingKind(query.keyword!) !== undefined &&
            inferShoppingKind(value) === inferShoppingKind(query.keyword!))))))
    .sort((a, b) => b.endedAt - a.endedAt);
  const signed = (value: number) => value >= 0 ? `+${value}` : String(value);
  const xp = (change: Change) =>
    `${attrName(change.id, change.name)} ${signed(change.actual)} XP (${change.before} → ${change.after})`;
  const effect = (change: Pick<Change, "before" | "after" | "actual">, name: string) =>
    `${name} ${change.before} → ${change.after} (${signed(change.actual)})`;
  if (query.view === "growth" || query.view === "attribute") {
    return result(entries.flatMap((entry) => entry.rewards
      .filter(({ id, name }) => matchesAttribute(id, name))
      .map((change) => ({ entry, change }))),
    ({ entry, change }) => `${stamp(entry.endedAt)} · ${entry.name} · ${xp(change)}`);
  }
  if (query.view === "status") {
    const changes = entries.flatMap((entry) => entry.effects
      .filter(({ id }) => !status || id === status)
      .map((change) => ({ at: entry.endedAt, source: entry.name, id: change.id, change })));
    if (!query.cardName && !query.keyword) {
      for (const change of state.changes) {
        if (statusCorrection.test(change.kind) && inRange(change.at) && (!status || change.name === status))
          changes.push({
            at: change.at, source: t("手动调整", "Manual adjustment"), id: change.name,
            change: { ...change, actual: change.after - change.before, requested: change.after - change.before, reason: "" },
          });
      }
    }
    changes.sort((a, b) => b.at - a.at);
    return result(changes, ({ at, source, id, change }) =>
      `${stamp(at)} · ${source} · ${effect(change, statusName(id))}`);
  }
  return result(entries, (entry) => {
    if (entry.purchase) {
      const purchase = entry.purchase;
      return [`${stamp(entry.endedAt)} · ${entry.name} · ${t("已购买", "Purchased")} · ${purchase.title ?? entry.name}`,
        `${purchase.merchant} · ${shoppingPrice(purchase.cents)} · Order ID ${purchase.orderId}`,
        purchase.url, entry.note && `${t("感悟", "Reflection")} · ${entry.note}`].filter(Boolean).join("\n");
    }
    const amount = entry.method === "quantity" ? ` · ${entry.quantity} ${t("单位", "units")}`
      : entry.seconds ? ` · ${entry.seconds / 60} ${t("分钟", "min")}` : "";
    const headline = `${stamp(entry.endedAt)} · ${entry.name}${amount} · ${entry.counted ? t("已打卡", "Checked in") : t("仅记录", "Logged only")}`;
    if (query.view === "check_ins") return headline;
    const details = [
      ...entry.rewards.map(xp),
      ...entry.effects.map((change) => effect(change, statusName(change.id))),
      ...entry.values.map((change) => effect(change, change.name)),
    ].join(" · ");
    return [headline, details, entry.note && `${t("感悟", "Reflection")} · ${entry.note}`].filter(Boolean).join("\n");
  });
}
