import { X } from "lucide-react";
import { ActionCardFace } from "../cards/CardAppearance";
import { PlanCardFinish } from "../cards/PlanCardFinish";
import { slotLabel } from "../plan-labels";
import { uiLocale } from "../i18n/runtime";
import type { State } from "../model";
import type { PlanBoard } from "./usePlanBoard";
import type { PlanGestures } from "./usePlanGestures";
import type { PlanItem } from "./types";

export function PlanEntry({
  s,
  board,
  gestures,
  item,
  planned,
}: {
  s: State;
  board: PlanBoard;
  gestures: PlanGestures;
  item: PlanItem;
  planned?: boolean;
}) {
  const {
    p,
    pr,
    arrival,
    closed,
    removeKey,
    RemoveKey,
    update,
    upcoming,
    SE,
    Choose,
    CE,
    Configure,
  } = board;
  const { down, move, up, suppress, scrollSuppress } = gestures;

  const c = s.cards.find((c) => c.id === item.cardId),
    r = p.cards.find((r) => r.id === item.cardId);
  if (!c || !r) return null;
  const slot = item.slot,
    key = slot?.id || c.id,
    count = pr.counts.find((v) => v.id === c.id)?.value || 0,
    label = slot ? slotLabel(p, slot, uiLocale) : "";
  return (
    <div
      className={
        "plan-entry " +
        (slot ? "plan-timeline-cell" : "plan-goal") +
        (arrival?.planId === p.id && arrival.key === key ? " is-new" : "")
      }
      key={key}
      data-plan-focus={key}
      onPointerDown={(e) => {
        if (!slot) down(e, c);
      }}
      onPointerMove={move}
      onPointerUp={(e) => up(e)}
      onPointerCancel={(e) => up(e, true)}
      onClickCapture={(e) => {
        if (suppress.current) {
          suppress.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {slot && (
        <>
          <div className="plan-slot-heading">
            <button
              className="plan-time-label"
              disabled={closed}
              aria-label={"修改安排 " + c.name + " " + label}
              onClick={() => {
                SE("");
                Choose({ card: c, slotId: slot.id, increment: false });
              }}
            >
              {p.scope === "once"
                ? label.replace("月", "/").replace("日", "")
                : label}
            </button>
          </div>
          <div className="plan-ticks" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </>
      )}
      <div className="plan-paper-wrap">
        <button
          draggable={false}
          className="gallery-card-paper"
          disabled={closed}
          aria-label={
            slot ? "计划安排卡牌 " + c.name + " " + label : "计划卡牌 " + c.name
          }
          aria-pressed={removeKey === key}
          onClick={() => RemoveKey((v) => (v === key ? null : key))}
        >
          <ActionCardFace card={c} showEdit={false} planned={planned} />
          {!closed && <PlanCardFinish surface="plan" />}
        </button>
        {removeKey === key && (
          <button
            className="plan-remove-cross"
            aria-label={
              slot
                ? "删除安排 " + c.name + " " + label
                : "移除计划卡牌 " + c.name
            }
            disabled={closed}
            onPointerDown={(e) => {
              suppress.current = false;
              scrollSuppress.current = false;
              e.stopPropagation();
            }}
            onClick={() =>
              void update((x) => {
                if (slot) x.slots = x.slots?.filter((v) => v.id !== slot.id);
                else {
                  x.cards = x.cards.filter((v) => v.id !== c.id);
                  x.slots = x.slots?.filter((v) => v.cardId !== c.id);
                }
                RemoveKey(null);
              })
            }
          >
            <X size={15} />
          </button>
        )}
      </div>
      {!slot && (
        <button
          className="plan-goal-summary"
          disabled={closed}
          aria-label={"修改计划卡牌 " + c.name}
          onPointerDown={() => {
            suppress.current = false;
            scrollSuppress.current = false;
          }}
          onClick={() => {
            CE("");
            Configure({ card: c, adding: false, increment: false });
          }}
        >
          {upcoming ? (
            <>
              <span>下周期计划{r.target}次</span>
              <small>
                {pr.counts.some((v) => v.id === c.id)
                  ? "本期已完成" +
                    count +
                    "/" +
                    pr.counts.find((v) => v.id === c.id)!.target +
                    "次"
                  : "本期未安排"}
              </small>
            </>
          ) : (
            <span>
              计划完成{count}/{r.target}次
            </span>
          )}
          {p.mode === "score" && <span>每次{r.score ?? c.score}分</span>}
        </button>
      )}{" "}
    </div>
  );
}
