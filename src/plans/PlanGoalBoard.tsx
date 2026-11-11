import type { ReactNode } from "react";
import type { Plan } from "../model";
import type { PlanItem } from "./types";
import type { PlanGestures } from "./usePlanGestures";
export function PlanGoalBoard({
  p,
  desktop,
  items,
  renderCard,
  gestures,
}: {
  p: Plan;
  desktop: boolean;
  items: PlanItem[];
  renderCard: (item: PlanItem) => ReactNode;
  gestures: PlanGestures;
}) {
  const { scrollGesture, scrollSuppress } = gestures;
  const goalBoard = (
    <div
      className="plan-rail plan-goal-board workspace-scroll-area"
      role="group"
      aria-label={p.mode === "cards" ? "卡牌模式任务框" : "积分模式任务框"}
      onPointerDown={(e) => {
        if (!p.cards.length) return;
        scrollSuppress.current = false;
        scrollGesture.current = {
          pointer: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          top: e.currentTarget.scrollTop,
          moved: false,
        };
      }}
      onPointerMove={(e) => {
        const g = scrollGesture.current;
        if (!g || g.pointer !== e.pointerId) return;
        const dy = e.clientY - g.y,
          dx = e.clientX - g.x;
        if (
          (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) ||
          (dy > 8 && g.top <= 1)
        ) {
          scrollGesture.current = null;
          return;
        }
        if (Math.abs(dy) > 8) {
          e.stopPropagation();
          g.moved = true;
          scrollSuppress.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          e.preventDefault();
          e.currentTarget.scrollTop = g.top - dy;
        }
      }}
      onPointerUp={() => {
        scrollGesture.current = null;
      }}
      onPointerCancel={() => {
        scrollGesture.current = null;
      }}
      onClickCapture={(e) => {
        if (scrollSuppress.current) {
          scrollSuppress.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <div className="plan-rail-strip">{items.map(renderCard)}</div>
      {!items.length && (
        <div className="plan-empty">
          <span>{desktop ? "从右侧拖入卡牌" : "从下方拖入卡牌"}</span>
        </div>
      )}
    </div>
  );

  return goalBoard;
}
