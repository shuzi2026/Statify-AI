import { attributeRules } from "../../shared/rules/growth";
import type { State } from "../model";

export function canAdjustInitialLevels(state: State, now: number) {
  return !state.initialEdited && now <= state.createdAt + attributeRules.initialAdjustmentWindowMs;
}

export function adjustInitialLevels(state: State, values: Record<string, number>, now: number) {
  if (!canAdjustInitialLevels(state, now)) throw Error("本次调整窗口已结束");
  const changes = Object.entries(values).map(([id, value]) => {
    const attribute = state.attributes.find((item) => item.id === id && item.slot >= 0);
    if (!attribute) throw Error("只能调整当前启用属性的初始等级。");
    if (!Number.isInteger(value) || value < 0 || value > attributeRules.maxLevel || value % 10 !== 0)
      throw Error("初始等级必须是 0 到 100 之间的 10 的倍数。");
    return { attribute, value };
  });
  for (const { attribute, value } of changes) attribute.initial = value;
  state.initialEdited = true;
}
