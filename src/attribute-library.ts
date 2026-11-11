import type { RuleContext } from "./rules/context";
import { attributeRules } from "../shared/rules/growth";
import { checkAttributeName } from "./text-limits";
import { type State, uid } from "./model";
import { trialActive } from "./engine";
export const attributeTemplates = [
  { name: "体魄", definition: "身体的力量、耐力与日常活动能力。" },
  { name: "记忆", definition: "保留信息并在需要时回想的能力。" },
  { name: "认知", definition: "学识、见识与理解思考的能力。" },
  { name: "专注", definition: "稳定投入、抵抗干扰与恢复注意力的能力。" },
  { name: "魅力", definition: "表达自己、与人相处并建立吸引力的能力。" },
  { name: "创造力", definition: "产生新想法并把想法变成作品的能力。" },
  { name: "表达力", definition: "清楚地组织和传达想法的能力。" },
];
export function createAttribute(s: State, name: string, initial: number) {
  const clean = name.trim();
  if (!clean) throw Error("请填写属性名称");
  checkAttributeName(clean);
  if (
    !Number.isInteger(initial) ||
    initial < 0 ||
    initial > attributeRules.maxLevel
  )
    throw Error("初始等级须为0–100的整数");
  if (s.attributes.some((a) => a.name === clean))
    throw Error("属性库已有同名属性，请选择已有档案");
  if (s.attributes.length >= attributeRules.libraryLimit)
    throw Error("属性库已达到数量上限");
  const attribute = {
    id: uid(),
    name: clean,
    initial,
    earned: 0,
    slot: -1,
    daily: {},
    original: false,
  };
  s.attributes.push(attribute);
  return attribute;
}
export function placeAttribute(
  s: State,
  choice: { id: string } | { name: string; initial: number },
  slot: number,
  context: RuleContext,
) {
  if (
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= attributeRules.totalSlots ||
    (!context.member && slot < attributeRules.freeSlots)
  )
    throw Error("请选择第5或第6属性槽位");
  if (!trialActive(s, context))
    throw Error("请先在设置中登录会员或开启属性试用，后两个槽位目前未开放");
  let attribute =
    "id" in choice ? s.attributes.find((a) => a.id === choice.id) : undefined;
  if ("id" in choice && !attribute) throw Error("找不到这项属性");
  if (attribute && attribute.slot >= 0) throw Error("这项属性已经在使用中");
  if (!attribute)
    attribute = createAttribute(
      s,
      (choice as { name: string }).name,
      (choice as { initial: number }).initial,
    );
  const previous = s.attributes.find((a) => a.slot === slot);
  if (previous) previous.slot = -1;
  attribute.slot = slot;
  return attribute;
}
export function moveAttribute(
  s: State,
  id: string,
  slot: number,
  context: RuleContext,
) {
  const attribute = s.attributes.find((a) => a.id === id);
  if (
    !attribute ||
    attribute.slot < 0 ||
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= attributeRules.totalSlots
  )
    throw Error("属性槽位无效");
  if (
    !context.member &&
    (!trialActive(s, context) ||
      attribute.slot < attributeRules.freeSlots ||
      slot < attributeRules.freeSlots)
  )
    throw Error("当前权益不允许调整此槽位");
  const other = s.attributes.find((a) => a.slot === slot),
    old = attribute.slot;
  attribute.slot = slot;
  if (other) other.slot = old;
}
export function needsDefaultAttributes(s: State, archiveCustom = false) {
  const originals = s.attributes
    .filter((a) => a.original)
    .slice(0, attributeRules.freeSlots);
  return (
    originals.some((a, i) => a.slot !== i) ||
    (archiveCustom &&
      s.attributes.some((a) => a.slot >= 0 && !originals.includes(a)))
  );
}
export function restoreDefaultAttributes(s: State, archiveCustom = false) {
  const originals = s.attributes
    .filter((a) => a.original)
    .slice(0, attributeRules.freeSlots);
  for (const a of s.attributes)
    if (
      a.slot >= 0 &&
      !originals.includes(a) &&
      (archiveCustom || a.slot < attributeRules.freeSlots)
    )
      a.slot = -1;
  originals.forEach((a, i) => {
    a.slot = i;
  });
}
