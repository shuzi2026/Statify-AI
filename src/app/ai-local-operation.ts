import type { AiExistingOperation } from "../../shared/ai-chat";
import { statusRules } from "../../shared/rules/status";
import { canAdjustInitialLevels } from "../attributes/initial-levels";
import { statusValue } from "../engine";
import type { Card, State } from "../model";
import type { Modal } from "./types";

const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase();
const activityAliases = [
  /^(散步|走走|出去走走|walking|walk|go for a walk)$/i,
  /^(喝水|喝一杯水|drink water|drink a glass of water)$/i,
  /^(阅读|读书|安静读一会儿|read|reading|read for a while)$/i,
  /^(写收获|写下一点收获|write down a takeaway)$/i,
  /^(睡觉|准备睡了|go to sleep|get ready for sleep)$/i,
];
export function findAiCards(cards: Card[], name: string) {
  const title = normalize(name);
  const exact = cards.filter((card) => normalize(card.name) === title);
  if (exact.length) return exact;
  const partial = cards.filter((card) => normalize(card.name).includes(title));
  if (partial.length) return partial;
  const aliases = activityAliases.find((group) => group.test(title));
  return aliases ? cards.filter((card) => aliases.test(normalize(card.name))) : [];
}
const categoryAliases = [/^(life|生活)$/i, /^(learning|学习)$/i, /^(work|工作)$/i, /^(exercise|运动)$/i];

export function resolveAiCategory(category: string, state: State) {
  const requested = normalize(category);
  if (!requested) return "";
  const group = categoryAliases.find((alias) => alias.test(requested));
  const match = state.categories.find((name) => normalize(name) === requested)
    ?? state.categories.find((name) => group?.test(normalize(name)));
  if (match === undefined) throw Error("找不到这个分类。请指定仓库中已有的分类。");
  return match;
}

export function prepareAiExistingOperation(operation: AiExistingOperation, state: State, now: number): Modal {
  switch (operation.type) {
    case "edit_card": {
      const matches = findAiCards(state.cards, operation.cardName);
      if (matches.length !== 1) throw Error("请用完整且唯一的卡名指定要编辑的卡牌。");
      const original = matches[0];
      const changes: Partial<Card> = {};
      if (operation.name !== null) changes.name = operation.name;
      if (operation.category !== null) changes.category = resolveAiCategory(operation.category, state);
      if (operation.method !== null) changes.method = operation.method;
      if (operation.minutes !== null) {
        if ((operation.method ?? original.method) !== "duration")
          throw Error("设置目标分钟数时，请同时选择固定时长。");
        changes.minutes = operation.minutes;
      }
      if (operation.unit !== null) changes.unit = operation.unit;
      if (operation.message !== null) changes.message = operation.message;
      if (!Object.keys(changes).length) throw Error("请说明你想修改哪项卡牌设置。");
      return { kind: "card", id: original.id, suggested: { original, changes } };
    }
    case "adjust_status": {
      const suggested: NonNullable<Extract<Modal, { kind: "status" }>["suggested"]> = {};
      for (const { id, mode, value } of operation.changes) {
        const target = mode === "set" ? value : statusValue(state, id, now) + value;
        if (suggested[id] !== undefined || target < statusRules.min || target > statusRules.max)
          throw Error("每个状态只能设置一次，目标值须在 0 到 100 之间。");
        suggested[id] = target;
      }
      return { kind: "status", suggested };
    }
    case "adjust_initial_levels": {
      if (!canAdjustInitialLevels(state, now)) throw Error("本次调整窗口已结束");
      const suggested: Record<string, number> = Object.create(null);
      for (const { attribute, value } of operation.changes) {
        const name = normalize(attribute);
        const matches = state.attributes.filter((item) => item.slot >= 0 &&
          (item.id === attribute || normalize(item.name) === name));
        if (matches.length !== 1 || suggested[matches[0].id] !== undefined)
          throw Error("请用完整且唯一的名称指定当前启用的属性。");
        suggested[matches[0].id] = value;
      }
      return { kind: "initial", suggested };
    }
  }
}
