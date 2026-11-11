import { actionRules } from "../../shared/rules/actions";
import {
  changeCardState,
  copyCard,
  deleteEntry,
  elapsed,
  freeze,
  pause,
  roundedMinutes,
  settle,
  start,
} from "../engine";
import { textLimits } from "../../shared/rules/text";
import { uid, type Card, type Entry, type State } from "../model";
import { isManualMeterChange } from "../meters";
import { planLocked, savePlan } from "../planning";
import type { RuleContext } from "../rules/context";

export type ManageOperation =
  "template" | "copy" | "abandon" | "archive" | "restore" | "reset" | "delete";
export const isManageOperation = (value: string): value is ManageOperation =>
  [
    "template",
    "copy",
    "abandon",
    "archive",
    "restore",
    "reset",
    "delete",
  ].includes(value);
export type ActionOutcome =
  | { kind: "completed"; entry: Entry }
  | { kind: "focus" | "settlement" | "abandon"; actionId: string };
type ReportedCheckIn = { minutes: number | null; quantity: number | null; note: string | null };
export type Command =
  | { type: "start"; cardId: string }
  | { type: "record"; cardId: string; method: Card["method"]; input: ReportedCheckIn }
  | { type: "complete"; actionId: string; freeze?: boolean; details?: Pick<ReportedCheckIn, "quantity" | "note"> }
  | {
      type: "settle";
      actionId: string;
      input: Parameters<typeof settle>[2];
      rememberEarlyCompletion?: boolean;
    }
  | { type: "manage-card"; cardId: string; operation: ManageOperation }
  | { type: "delete-entry"; entryId: string }
  | { type: "delete-meter"; meterId: string }
  | { type: "pause"; actionId: string; paused?: boolean }
  | { type: "cancel-action"; actionId: string; confirm?: boolean }
  | { type: "quantity"; actionId: string; quantity: number };
export type CommandValue<C extends Command> = C extends {
  type: "start" | "complete" | "record";
}
  ? ActionOutcome
  : C extends { type: "settle" }
    ? Entry
    : void;
export class CardConfirmation extends Error {
  constructor(readonly message: string, readonly title?: string) {
    super(message);
  }
}
/** A successful idempotent/read-only outcome does not create a save revision. */
export class Unchanged<T> extends Error {
  constructor(readonly value: T) {
    super("unchanged");
  }
}

/** Complete business operations, with explicit time/entitlements and no UI or I/O. */
export function applyCommand<C extends Command>(
  state: State,
  command: C,
  context: RuleContext,
  confirmed = false,
): CommandValue<C> {
  return execute(state, command, context, confirmed) as CommandValue<C>;
}
function execute(
  s: State,
  command: Command,
  context: RuleContext,
  confirmed: boolean,
): ActionOutcome | Entry | void {
  const at = context.now;
  if (command.type === "start" || command.type === "record") {
    const live = s.cards.find((c) => c.id === command.cardId);
    const report = command.type === "record" ? command.input : undefined;
    if (command.type === "record" && live?.method !== command.method)
      throw Error("卡牌的打卡方式已变化，请重试。");
    const minutes = report?.minutes ?? 0;
    const quantity = report?.quantity ?? 1;
    if (report && (
      !Number.isInteger(minutes) || minutes < 0 || minutes * 60 > actionRules.maxSeconds ||
      !Number.isInteger(quantity) || quantity < 1 || quantity > actionRules.maxQuantity ||
      (report.note?.length ?? 0) > textLimits.note ||
      ((live?.method === "duration" || live?.method === "timed") && !minutes) ||
      (live?.method === "quantity" && report.quantity === null)
    )) throw Error("请检查本次时长、数量与感想。");
    const actionId = start(s, command.cardId, at),
      action = s.actions.find((a) => a.id === actionId)!,
      card = action.card;
    if (report && (card.method !== "instant" || report.note)) {
      action.reported = true;
      action.endedAt = at;
      action.runningSince = null;
      action.elapsed = card.method === "quantity" || card.method === "instant" ? 0 : minutes * 60_000;
      action.draft = {
        seconds: action.elapsed / 1000, quantity, rating: 1, counted: null, note: report.note ?? "",
      };
      return { kind: "settlement", actionId };
    }
    if (card.method === "instant" && !card.evaluate && !card.settle)
      return {
        kind: "completed",
        entry: settle(
          s,
          actionId,
          { seconds: 0, quantity: 1, rating: 1, counted: true, note: "" },
          context,
        ),
      };
    return {
      kind: card.method === "instant" ? "settlement" : "focus",
      actionId,
    };
  }
  if (command.type === "complete" || command.type === "settle") {
    const old = s.entries.find((e) => e.id === command.actionId);
    if (old)
      throw new Unchanged(
        command.type === "settle" ? old : { kind: "completed", entry: old },
      );
    const action = s.actions.find((a) => a.id === command.actionId);
    if (!action) throw Error("找不到进行中的行动");
    if (command.type === "settle") {
      const result = settle(s, action.id, command.input, context);
      if (command.rememberEarlyCompletion)
        s.preferences.earlyCompletion = command.input.counted
          ? "count"
          : "record";
      return result;
    }
    if (
      action.card.method !== "instant" &&
      elapsed(action, at) < actionRules.minElapsedSeconds
    )
      throw new Unchanged({ kind: "abandon", actionId: action.id });
    if (command.freeze) freeze(s, action.id, at);
    const seconds = roundedMinutes(elapsed(action, at)) * 60;
    if (command.freeze && command.details) {
      const { note, quantity } = command.details;
      if ((note?.length ?? 0) > textLimits.note || (quantity !== null &&
          (!Number.isInteger(quantity) || quantity < 1 || quantity > actionRules.maxQuantity)))
        throw Error("请检查本次数量与感想。");
      action.draft = {
        seconds,
        quantity: action.card.method === "quantity" ? quantity ?? action.draft?.quantity ?? 1 : 1,
        rating: action.draft?.rating ?? 1,
        counted: action.draft?.counted ?? null,
        note: note ?? action.draft?.note ?? "",
      };
    }
    if (
      action.card.evaluate ||
      action.card.settle ||
      (command.details && (action.card.method === "quantity" || action.draft?.note)) ||
      (action.card.method === "duration" &&
        seconds < Math.round(action.card.minutes) * 60 &&
        s.preferences.earlyCompletion === "ask")
    ) {
      const value: ActionOutcome = { kind: "settlement", actionId: action.id };
      if (!command.freeze) throw new Unchanged(value);
      return value;
    }
    return {
      kind: "completed",
      entry: settle(
        s,
        action.id,
        {
          seconds,
          quantity: action.draft?.quantity ?? 1,
          rating: 1,
          counted:
            action.card.method !== "duration" ||
            seconds >= Math.round(action.card.minutes) * 60 ||
            s.preferences.earlyCompletion === "count",
          note: "",
        },
        context,
      ),
    };
  }
  if (command.type === "pause") {
    if (command.paused !== undefined) {
      const action = s.actions.find((item) => item.id === command.actionId && item.endedAt === null);
      if (!action) throw Error("找不到进行中的行动");
      if ((action.runningSince === null) === command.paused) throw new Unchanged(undefined);
    }
    return pause(s, command.actionId, at);
  }
  if (command.type === "delete-meter") {
    const meter = s.meters.find((item) => item.id === command.meterId);
    if (!meter) throw new Unchanged(undefined);
    if (!confirmed)
      throw new CardConfirmation(meter.name + "\n\n" + "删除这个数值及其自身日志？独立行动中的结算快照保留。");
    s.meters = s.meters.filter((meter) => meter.id !== command.meterId);
    s.changes = s.changes.filter(
      (change) => change.objectId !== command.meterId || !isManualMeterChange(change.kind),
    );
    return;
  }
  if (command.type === "delete-entry") {
    const entry = s.entries.find((e) => e.id === command.entryId);
    if (!entry) throw new Unchanged(undefined);
    if (!confirmed)
      throw new CardConfirmation(
        entry.name + " · " + new Date(entry.endedAt).toLocaleString() + "\n\n" + (entry.legacy &&
          !entry.rewards.length &&
          !entry.effects.length &&
          !entry.values.length
          ? "这条旧记录没有结算明细，无法返还经验、状态和自定义数值。删除记录和感想后无法撤回。"
          : "删除会移除这条记录和感想，并撤销本次结算对仍存在的属性经验、状态和自定义数值造成的变化。返还结果受当前上下限约束。删除后无法撤回。"),
        "确认要删除这条行动记录吗？",
      );
    deleteEntry(s, command.entryId, at);
    return;
  }
  if (command.type === "cancel-action") {
    if (command.confirm) {
      const action = s.actions.find((item) => item.id === command.actionId && item.endedAt === null);
      if (!action) throw Error("找不到进行中的行动");
      if (!confirmed) throw new CardConfirmation(action.card.name + "\n\n" + "结束视为放弃行动。");
    }
    s.actions = s.actions.filter((a) => a.id !== command.actionId);
    return;
  }
  if (command.type === "quantity") {
    const action = s.actions.find((a) => a.id === command.actionId);
    if (!action || action.endedAt !== null) throw new Unchanged(undefined);
    action.draft = {
      seconds: 0,
      rating: 1,
      counted: null,
      note: "",
      ...action.draft,
      quantity: command.quantity,
    };
    return;
  }
  const { cardId: id, operation: type } = command;
  const live = s.cards.find((c) => c.id === id);
  if (!live) throw Error("找不到卡牌");
  if (!confirmed) {
    if (type === "abandon")
      throw new CardConfirmation(
        "弃用表示暂时不再使用这张卡牌。它会从首页和可用卡牌中收起，移入弃用列表；历史记录与成长保留，之后可以恢复使用。确认弃用「" +
          live.name +
          "」？",
      );
    if (type === "archive")
      throw new CardConfirmation(
        "归档表示这张卡牌之后不可重复使用。原卡牌将移入归档列表，不能恢复；历史记录与成长保留。如需再次使用，可以复制为一张新卡牌。确认归档「" +
          live.name +
          "」？",
      );
    if (type === "delete")
      throw new CardConfirmation(
        "永久删除卡牌？每日记录、感想、成长和已结算计划结果保留。",
      );
    if (type === "reset")
      throw new CardConfirmation(
        "恢复并重置卡牌统计？独立行动、成长与计划贡献保留。",
      );
  }
  if (type !== "copy" && s.actions.some((a) => a.card.id === id))
    throw Error("请先保存或取消这张卡牌的当前行动");
  if (type === "template")
    s.cardTemplates.push({
      ...structuredClone(live),
      id: uid(),
      count: 0,
      state: "active",
      changes: [],
    });
  if (type === "copy") copyCard(s, id, at);
  if (
    type === "abandon" ||
    type === "archive" ||
    type === "restore" ||
    type === "reset"
  )
    changeCardState(s, id, type, at);
  if (type !== "delete") return;
  const related = s.plans.filter((p) => p.cards.some((r) => r.id === id));
  if (related.some((p) => p.scope && planLocked(p, at)))
    throw Error("卡牌属于已锁定的计划，当前不能删除");
  for (const p of related) {
    if (p.scope) {
      const next = structuredClone(p);
      next.cards = next.cards.filter((r) => r.id !== id);
      next.slots = next.slots?.filter((slot) => slot.cardId !== id);
      if (next.mode === "score")
        next.target = Math.min(
          next.target,
          Math.max(
            1,
            next.cards.reduce((v, r) => v + r.target * (r.score || 0), 0),
          ),
        );
      savePlan(s, next, at);
    } else p.cards = p.cards.filter((r) => r.id !== id);
  }
  s.cards = s.cards.filter((c) => c.id !== id);
}
