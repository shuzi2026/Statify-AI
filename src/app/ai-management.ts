import type { AiManagementOperation } from "../../shared/ai-management";
import { CardConfirmation, Unchanged, applyCommand, type Command } from "../application/commands";
import { application } from "../application/runtime";
import { createAttribute, moveAttribute, placeAttribute } from "../attribute-library";
import { reorderCommon, toggleCommon } from "../card-collection";
import { setCardMotion } from "../cards/card-motion";
import { confirmAction } from "../components";
import { addCardFromTemplate, dateKey } from "../engine";
import { saveJournalNote } from "../journal/note";
import { templates, type Card, type Meter, type State } from "../model";
import { setPlanMode } from "../planning";
import { saveSnapshot, type SaveSnapshot } from "../save-publication";
import { selectableThemes } from "../themes/catalog";
import { chooseTheme } from "../themes/runtime";
import { matchingEntries } from "./ai-activity";
import { findAiCards } from "./ai-local-operation";
import { applyPlanOperation } from "./ai-plan";
import type { Actions, Modal } from "./types";

type Operation<T extends AiManagementOperation["type"]> = Extract<AiManagementOperation, { type: T }>;
const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase();

function named<T extends { id: string; name: string }>(items: T[], name: string, message: string) {
  const matches = items.filter((item) => item.id === name || normalize(item.name) === normalize(name));
  if (matches.length !== 1) throw Error(message);
  return matches[0];
}

function cardNamed(cards: Card[], name: string) {
  const matches = findAiCards(cards, name);
  if (matches.length !== 1) throw Error("请用完整且唯一的卡名指定要操作的卡牌。");
  return matches[0];
}

export function meterSuggestion(op: Operation<"manage_meter">, original?: Meter) {
  const changes: Partial<Omit<Meter, "id">> = {};
  if (op.action === "create") changes.name = op.target;
  if (op.newName !== null) changes.name = op.newName;
  if (op.unit !== null) changes.unit = op.unit;
  if (op.value !== null)
    changes.value = op.value + (op.valueMode === "add" ? Math.round(original?.value ?? 0) : 0);
  for (const bound of ["min", "max"] as const) {
    const input = op[bound];
    if (!input) continue;
    if (input.mode === "set" && input.value === null) throw Error("请提供要设置的数值上下限。");
    changes[bound] = input.mode === "clear" ? null : input.value;
  }
  if (!Object.keys(changes).length) throw Error("请说明你想修改哪项自定义数值设置。");
  return { original, changes };
}

function cardRules(op: Operation<"edit_card_rules">, state: State): Modal {
  const original = cardNamed(state.cards, op.cardName);
  const changes: Partial<Card> = {};
  for (const key of ["life", "uses", "cap", "capPeriod", "score", "evaluate", "settle", "timeMode", "rest", "sleep"] as const) {
    const value = op[key];
    if (value !== null) Object.assign(changes, { [key]: value });
  }
  if (op.timeWindows !== null) {
    changes.timeWindows = op.timeWindows;
    changes.timeStart = "";
    changes.timeEnd = "";
  }
  if (op.rewards !== null) changes.rewards = op.rewards.map(({ name, amount }) => ({
    id: named(state.attributes, name, "请用完整且唯一的属性名指定奖励。").id, amount,
  }));
  if (op.effects !== null) changes.effects = op.effects;
  if (op.values !== null) changes.values = op.values.map(({ name, amount }) => ({
    id: named(state.meters, name, "请用完整且唯一的数值名称指定结算变化。").id, amount,
  }));
  for (const key of ["rewards", "effects", "values"] as const) {
    const items = changes[key];
    if (!items) continue;
    const updated = new Set(items.map(({ id }) => id));
    if (updated.size !== items.length)
      throw Error("同一项结算变化只能设置一次。");
    changes[key] = [
      ...(op.replaceLists ? [] : original[key].filter(({ id }) => !updated.has(id))),
      ...items.filter(({ amount }) => amount !== 0),
    ];
  }
  if (!Object.keys(changes).length) throw Error("请说明你想修改哪项卡牌设置。");
  return { kind: "card", id: original.id, suggested: { original, changes } };
}

export async function applyAiManagement(
  op: AiManagementOperation,
  { state, scope }: SaveSnapshot,
  present: Actions["present"],
  openEditor: (modal: Modal) => void,
  chinese: boolean,
) {
  const t = (zh: string, en: string) => chinese ? zh : en;
  const review = t("已打开编辑表单，请核对后保存。", "I opened the editor. Review the details and save.");
  const canceled = t("已取消更改。", "The change was canceled.");
  const meterError = "请用完整且唯一的名称指定自定义数值。";
  if (op.type === "manage_meter" && op.action !== "delete") {
    const original = op.action === "edit" ? named(state.meters, op.target, meterError) : undefined;
    openEditor({ kind: "meter", id: original?.id, suggested: meterSuggestion(op, original) });
    return review;
  }
  if (op.type === "edit_card_rules") {
    openEditor(cardRules(op, state));
    return review;
  }
  if (op.type === "edit_appearance") {
    const title = t("应用外观更改？", "Apply appearance changes?");
    if (op.action === "theme") {
      if (!op.themeName) throw Error(t("请指定皮肤名称。", "Specify a theme name."));
      const theme = named(selectableThemes, op.themeName, t("找不到这套皮肤，请用选择器里的完整名称。", "Use the full theme name shown in the picker."));
      if (!await confirmAction(theme.name, title) || saveSnapshot()?.scope !== scope) return canceled;
      const result = await chooseTheme(theme.id);
      if (result === "member-required") throw Error(t("当前权限无法更换皮肤。", "Your current access does not allow switching themes."));
      if (result !== "saved") throw Error(t("皮肤未能保存。", "The theme could not be saved."));
    } else {
      if (op.enabled === null) throw Error(t("请指定开启还是关闭。", "Specify whether to turn the effect on or off."));
      const floating = op.action === "floating";
      const effect = floating ? t("卡牌浮动", "Card floating") : t("光影效果", "Card lighting");
      const value = op.enabled ? t("开启", "On") : t("关闭", "Off");
      if (!await confirmAction(`${effect} · ${value}`, title) || saveSnapshot()?.scope !== scope) return canceled;
      if (!await setCardMotion(floating ? "cardFloatingOverride" : "cardLighting", op.enabled))
        throw Error(t("外观偏好未能保存。", "The appearance preference could not be saved."));
    }
    return t("外观已更新。", "The appearance was updated.");
  }
  if (op.type === "manage_timer") {
    const active = state.actions.filter(({ endedAt }) => endedAt === null);
    const cards = op.cardName ? findAiCards([...state.cards, ...active.map(({ card }) => card)], op.cardName) : [];
    const cardIds = new Set(cards.map(({ id }) => id));
    const matches = active.filter(({ card }) => !op.cardName || cardIds.has(card.id));
    if (matches.length !== 1) throw Error("请用完整且唯一的卡名指定进行中的行动。");
    const { id: actionId, card } = matches[0];
    let command: Command;
    let reply: string;
    if (op.action === "cancel") {
      command = { type: "cancel-action", actionId, confirm: true };
      reply = t("本次行动已放弃。", "The activity was discarded.");
    } else if (op.action === "set_quantity") {
      if (card.method !== "quantity" || op.quantity === null)
        throw Error("请指定计数卡牌的本次数量。");
      command = { type: "quantity", actionId, quantity: op.quantity };
      reply = t(`本次数量已设为 ${op.quantity}。`, `Set this session’s quantity to ${op.quantity}.`);
    } else {
      const paused = op.action === "pause";
      command = { type: "pause", actionId, paused };
      reply = paused ? t("计时已暂停。", "The timer is paused.") : t("计时已恢复。", "The timer is running.");
    }
    const result = await present(application.execute(command, scope), () => {});
    if (result.status === "error") throw Error(result.message);
    return result.status === "success" ? reply : canceled;
  }
  const requestedAt = Date.now();
  const result = await present(application.change((save, context, confirmed) => {
    const confirm = (message: string, title: string) => {
      if (!confirmed) throw new CardConfirmation(message, title);
    };
    switch (op.type) {
      case "manage_meter": {
        const meter = named(save.meters, op.target, meterError);
        applyCommand(save, { type: "delete-meter", meterId: meter.id }, context, confirmed);
        return t(`已删除数值「${meter.name}」。`, `Deleted the “${meter.name}” meter.`);
      }
      case "manage_plan":
        applyPlanOperation(save, op, context.now, confirmed, chinese, requestedAt);
        return t("计划已更新。", "The plan was updated.");
      case "manage_attribute": {
        const slot = op.slot === null ? undefined : op.slot - 1;
        const title = t("应用属性更改？", "Apply attribute changes?");
        const other = save.attributes.find((item) => item.slot === slot);
        const destination = op.slot === null ? t("属性库", "Attribute library") : t(`第 ${op.slot} 槽`, `Slot ${op.slot}`);
        if (op.action === "create") {
          if (op.initial === null) throw Error("请指定新属性的初始等级。");
          const replace = other ? t(` · 「${other.name}」将移入属性库`, ` · Move “${other.name}” to the library`) : "";
          confirm(`${op.name} · Lv. ${op.initial} · ${destination}${replace}`, title);
          if (slot === undefined) createAttribute(save, op.name, op.initial);
          else placeAttribute(save, { name: op.name, initial: op.initial }, slot, context);
        } else {
          const item = named(save.attributes, op.name, "请用完整且唯一的名称指定属性。");
          if (slot === undefined) throw Error("请指定目标属性槽位。");
          const move = other && item.id !== other.id
            ? op.action === "move" ? t(` · 与「${other.name}」交换`, ` · Swap with “${other.name}”`) :
              t(` · 「${other.name}」将移入属性库`, ` · Move “${other.name}” to the library`) : "";
          confirm(`${item.name} → ${destination}${move}`, title);
          if (op.action === "move") moveAttribute(save, item.id, slot, context);
          else placeAttribute(save, { id: item.id }, slot, context);
        }
        return t("属性已更新。", "The attribute was updated.");
      }
      case "manage_card": {
        const { action } = op;
        if (action === "use_template") {
          const template = cardNamed([...templates(context.now), ...save.cardTemplates], op.cardName);
          confirm(template.name, t("从这张模板新建卡牌？", "Create a card from this template?"));
          addCardFromTemplate(save, template, context);
          return t(`已从模板「${template.name}」创建卡牌。`, `Created a card from “${template.name}”.`);
        }
        const card = cardNamed(save.cards, op.cardName);
        if (action === "favorite" || action === "unfavorite") {
          if (card.state !== "active") throw Error("请先恢复这张卡牌再修改收藏。");
          if (card.favorite === (action === "favorite"))
            throw new Unchanged(t("收藏状态已符合你的要求。", "The favorite status already matches your request."));
          toggleCommon(save, card.id);
        } else if (action === "reorder_favorite") {
          const before = op.beforeCardName && cardNamed(save.cards, op.beforeCardName);
          if (!reorderCommon(save, card.id, before ? before.id : null))
            throw Error("请在常用卡牌中选择有效的排序位置。");
        } else {
          applyCommand(save, { type: "manage-card", cardId: card.id, operation: action }, context, confirmed);
        }
        return t(`已完成「${card.name}」的卡牌操作。`, `Done. I applied the requested action to “${card.name}”.`);
      }
      case "manage_journal": {
        const entries = matchingEntries(save, op.cardName)
          .filter((entry) => !op.date || dateKey(entry.endedAt) === op.date)
          .sort((a, b) => b.endedAt - a.endedAt);
        const entry = entries[0];
        if (!entry) throw Error("找不到匹配的日志。");
        if ((op.date && entries.length > 1) || (op.cardName && new Set(entries.map(({ cardId }) => cardId)).size > 1))
          throw Error("匹配到多条日志，请补充卡名或在日志中选中具体记录。");
        if (op.action === "delete_entry") {
          applyCommand(save, { type: "delete-entry", entryId: entry.id }, context, confirmed);
          return t(`已删除「${entry.name}」的这次打卡。`, `Deleted the selected “${entry.name}” check-in.`);
        }
        const note = op.action === "clear_note" ? "" : op.note;
        if (note === null) throw Error("请提供要写入的新感悟。");
        confirm(`${entry.name} · ${new Date(entry.endedAt).toLocaleString()}\n\n${note || t("清空感悟", "Clear reflection")}`,
          t("应用感悟更改？", "Apply reflection change?"));
        saveJournalNote(save, entry.id, note);
        return t("已更新这条日志的感悟。", "I updated the reflection on that entry.");
      }
      case "edit_preferences": {
        const { planMode, earlyCompletion, rewardPerUnitMax, rewardTotalMax } = op;
        const mode = planMode === "cards" ? t("按次数", "By count") : t("按积分", "By points");
        const early = { ask: t("每次询问", "Ask each time"), count: t("完成一次", "Count as completed"), record: t("只记录投入", "Record effort only") };
        const details = [
          planMode !== null && t(`计划结算 · ${mode}`, `Plan completion · ${mode}`),
          earlyCompletion !== null && t(`提前完成 · ${early[earlyCompletion]}`, `Early completion · ${early[earlyCompletion]}`),
          rewardPerUnitMax !== null && t(`每单位奖励滑轨上限 · ${rewardPerUnitMax}`, `Per-unit reward slider limit · ${rewardPerUnitMax}`),
          rewardTotalMax !== null && t(`整体奖励滑轨上限 · ${rewardTotalMax}`, `Total reward slider limit · ${rewardTotalMax}`),
        ].filter(Boolean);
        if (!details.length) throw Error("请指定要修改的偏好设置。");
        confirm(details.join("\n"), t("应用偏好更改？", "Apply preferences?"));
        if (planMode !== null) setPlanMode(save, planMode, context.now);
        if (earlyCompletion !== null) save.preferences.earlyCompletion = earlyCompletion;
        if (rewardPerUnitMax !== null) save.preferences.rewardPerUnitMax = rewardPerUnitMax;
        if (rewardTotalMax !== null) save.preferences.rewardTotalMax = rewardTotalMax;
        return t("偏好已更新。", "Preferences were updated.");
      }
    }
  }, scope), () => {});
  if (result.status === "error") throw Error(result.message);
  return result.status === "success" ? result.value : canceled;
}
