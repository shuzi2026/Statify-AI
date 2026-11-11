import type { AiActivityOperation } from "../../shared/ai-chat";
import { confirmAction } from "../components";
import { application } from "../application/runtime";
import { dateKey } from "../engine";
import { saveJournalNote } from "../journal/note";
import type { SaveSnapshot } from "../save-publication";
import type { Actions } from "./types";
import { matchingEntries } from "./ai-activity";
import { findAiCards } from "./ai-local-operation";
import { isWalkingCard } from "./ai-walk-agent";

type ActivityWrite = Exclude<AiActivityOperation, { type: "read_activity" }>;
type WalkContext = {
  actionId?: string;
  entryId?: string;
  onStart: (actionId: string) => void;
};
type ActivityReply = string | {
  reply: string;
  context?: string;
  walkId?: string;
  reflectionFinished?: boolean;
};

export async function applyAiActivity(
  operation: ActivityWrite,
  { state, scope }: SaveSnapshot,
  runAction: Actions["runAiAction"],
  chinese: boolean,
  walk: WalkContext,
): Promise<ActivityReply> {
  const t = (zh: string, en: string) => chinese ? zh : en;
  const name = operation.cardName;
  if (operation.type === "append_journal_note") {
    const namedEntries = matchingEntries(state, name);
    const entryId = walk.entryId && !operation.date &&
      (!name || namedEntries.some(({ id }) => id === walk.entryId)) ? walk.entryId : undefined;
    if (!entryId && !name && !operation.date && state.actions.length)
      return t("你还有进行中或待结算的行动。请先完成打卡，或告诉我想补写哪张卡的日志。", "An action is still running or awaiting review. Finish it first, or name the card whose journal you want to update.");
    const candidates = entryId ? state.entries.filter(({ id }) => id === entryId) : namedEntries;
    const matches = candidates
      .filter((entry) => !operation.date || dateKey(entry.endedAt) === operation.date)
      .sort((a, b) => b.endedAt - a.endedAt);
    if ((name && new Set(matches.map((entry) => entry.cardId)).size > 1) || (operation.date && matches.length > 1))
      return t("找到了多条可能的日志。请提供完整卡名，或在日志里选择具体那一条。", "Several entries match. Give me the full card name or choose the exact entry in the journal.");
    const entry = matches[0];
    if (!entry) return t("找不到可以写入感悟的打卡日志。", "I couldn't find a check-in to attach this reflection to.");
    const when = new Date(entry.endedAt).toLocaleString();
    if (!await confirmAction(`${entry.name} · ${when}\n\n${operation.note}`, t("将感悟追加到这条日志？", "Add this reflection to the journal entry?")))
      return { reply: t("已取消追加感悟。", "Reflection canceled."), reflectionFinished: !!entryId };
    const note = [entry.note, operation.note].filter(Boolean).join("\n\n");
    const result = await application.change((save) => saveJournalNote(save, entry.id, note, entry.note), scope);
    if (result.status === "error") throw Error(result.message);
    return result.status === "success"
      ? {
          reply: t(`已把感悟追加到「${entry.name}」的日志。`, `I added the reflection to the “${entry.name}” journal entry.`),
          reflectionFinished: !!entryId,
        }
      : t("感悟未保存，请重试。", "The reflection wasn't saved. Please try again.");
  }

  const cards = name ? findAiCards(state.cards, name) : [];
  const active = state.actions;
  const card = name && cards.length === 1 ? cards[0] : undefined;
  // An action retains its original title if the live card is renamed or removed.
  const activeByName = name ? findAiCards(active.map((action) => action.card), name) : [];
  const matched = active.filter((action) => name
    ? card ? action.card.id === card.id : activeByName.some(({ id }) => id === action.card.id)
    : !walk.actionId || action.id === walk.actionId);
  if (cards.length > 1 || matched.length > 1)
    return t("请用完整且唯一的卡名指定行动。", "Please give the exact name of one card.");
  const running = operation.type === "record_card" ? matched[0] : undefined;
  const target = running?.card ?? card;
  if (!target) return name
    ? t(`找不到「${name}」对应的卡牌。请告诉我仓库里的卡名。`, `I couldn't find a card for “${name}”. Give me its name from the collection.`)
    : t("当前没有进行中的行动。你想给哪张卡打卡？", "There is no ongoing action. Which card should I check in?");
  const title = target.name;
  const walking = isWalkingCard(title);
  if (running?.endedAt != null)
    return t(`「${title}」已经结束，请在结算界面确认保存。`, `“${title}” has ended. Confirm it in the review window.`);
  if (operation.type === "start_card" && target.method === "instant")
    return t(`「${title}」是即时打卡卡牌。完成后告诉我，我就能帮你打卡。`, `“${title}” is an instant check-in card. Tell me when you're done and I'll check it in.`);
  if (operation.type === "record_card" && !running) {
    if (["duration", "timed"].includes(target.method) && operation.minutes === null)
      return {
        reply: t(`「${title}」没有正在运行的计时。这次实际做了几分钟？`, `“${title}” has no running timer. How many minutes did you spend on it?`),
        context: "How many minutes did you spend on the activity you want to check in?",
      };
    if (target.method === "quantity" && operation.quantity === null)
      return {
        reply: t(`「${title}」这次完成了多少？单位是 ${target.unit}。`, `How many did you complete for “${title}”? The unit is ${target.unit}.`),
        context: "What quantity did you complete for the activity you want to check in?",
      };
  }

  const outcome = operation.type === "start_card"
    ? await runAction({ type: "start", cardId: target.id }, scope, walking ? walk.onStart : undefined)
    : running
      ? await runAction({
          type: "complete", actionId: running.id, freeze: true,
          details: { quantity: operation.quantity, note: operation.note },
        }, scope)
      : await runAction({
          type: "record", cardId: target.id, method: target.method,
          input: { minutes: operation.minutes, quantity: operation.quantity, note: operation.note },
        }, scope);
  switch (outcome?.kind) {
    case "focus":
      return {
        reply: t(`已开始「${title}」。`, `I started “${title}”.`),
        walkId: walking ? outcome.actionId : undefined,
      };
    case "settlement":
      return {
        reply: t(`「${title}」的结算已打开。请核对并保存。`, `Review and save the check-in for “${title}”.`),
        context: "I opened the check-in review. The user can confirm it locally.",
        walkId: walking ? outcome.actionId : undefined,
      };
    case "abandon":
      return t(`「${title}」的计时还没满一分钟。请在界面选择继续或放弃。`, `“${title}” has been running for less than a minute. Choose whether to continue or abandon it.`);
    case "completed":
      return {
        reply: t(`已保存「${title}」的打卡。`, `I saved the check-in for “${title}”.`),
        context: "I saved the check-in locally.",
        walkId: walking ? outcome.entry.id : undefined,
      };
    default:
      return t("本次操作已取消。", "The action was canceled.");
  }
}
