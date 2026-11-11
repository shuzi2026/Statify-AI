import { createPortal } from "react-dom";
import { ActionCardFace } from "./cards/CardAppearance";
import { tourPlanSplit } from "./guides/tour";
import { usePlanBoard } from "./plans/usePlanBoard";
import { usePlanGestures } from "./plans/usePlanGestures";
import {
  usePlanDesktop,
  usePlanLayout,
  usePlanArrival,
  PlanDivider,
} from "./plans/PlanLayout";
import { PlanSelection } from "./plans/PlanSelection";
import { PlanProgress } from "./plans/PlanProgress";
import { PlanEntry } from "./plans/PlanEntry";
import { PlanGoalBoard } from "./plans/PlanGoalBoard";
import { PlanSources } from "./plans/PlanSources";
import { PlanEditors } from "./plans/PlanEditors";
import type { PlanWorkspaceProps, PlanItem } from "./plans/types";

export function PlanWorkspace({
  s,
  now,
  plannedCards,
  readOnlyDemo = false,
  cardFilter,
  setCardFilter,
  run,
  open,
  deleteCard,
  editCard,
  begin,
}: PlanWorkspaceProps) {
  const desktop = usePlanDesktop();
  const board = usePlanBoard({ s, now, readOnlyDemo, run });
  const {
    selection,
    select,
    p,
    viewKey,
    closed,
    upcoming,
    liveCycle,
    updating,
    error,
    arrival,
    Arrive,
    setting,
    Source,
    slots,
    timelineItems,
  } = board;
  const gestures = usePlanGestures({
    p,
    desktop,
    readOnlyDemo,
    choosing: board.choosing,
    configuring: board.configuring,
    add: board.add,
  });
  const {
    drag,
    drop,
    timelineDrop,
    railPan,
    timelineDown,
    timelineMove,
    timelineEnd,
    timelineClick,
  } = gestures;
  const layoutState = usePlanLayout({
    p,
    viewKey,
    desktop,
    readOnlyDemo,
    drop,
  });
  const { layout, holdSplitForTimeline } = layoutState;
  usePlanArrival({ arrival, Arrive, p, desktop, layout });
  const renderCard = (item: PlanItem) => (
    <PlanEntry
      key={item.slot?.id || item.cardId}
      s={s}
      board={board}
      gestures={gestures}
      item={item}
      planned={plannedCards?.has(item.cardId)}
    />
  );
  const goalBoard = (
    <PlanGoalBoard
      p={p}
      desktop={desktop}
      items={board.items}
      renderCard={renderCard}
      gestures={gestures}
    />
  );
  const progressView = <PlanProgress board={board} />;
  return (
    <div
      ref={layout}
      data-guide-demo={readOnlyDemo || undefined}
      className={
        "workspace-plan-layout plan-system plan-two-panels " +
        (p.timeline ? "is-timeline-on" : "is-timeline-off")
      }
      style={
        !desktop && readOnlyDemo
          ? {
              gridTemplateRows: `minmax(${!p.timeline ? "min-content" : "0"},${tourPlanSplit * 100}fr) auto minmax(0,${(1 - tourPlanSplit) * 100}fr)`,
            }
          : undefined
      }
    >
      <section
        ref={drop}
        aria-busy={updating}
        className={
          "workspace-plans workspace-scroll-area " +
          (drag ? "is-drop-ready" : "")
        }
        aria-label="计划面板"
        style={{ touchAction: p.timeline ? "pan-y" : "pan-x" }}
        onPointerDown={timelineDown}
        onPointerMove={timelineMove}
        onPointerUp={timelineEnd}
        onPointerCancel={timelineEnd}
        onLostPointerCapture={(e) => {
          if (e.target === e.currentTarget) railPan.current = null;
        }}
        onClickCapture={timelineClick}
      >
        <PlanSelection
          selection={selection}
          select={select}
          p={p}
          now={now}
          toggleTimeline={(enabled) => {
            Source("tasks");
            holdSplitForTimeline();
            setting(p.mode, enabled);
          }}
        />
        {p.timeline ? (
          <>
            <h2 className="plan-area-label">
              {upcoming ? "下周期时间轴" : "时间轴"}
            </h2>
            <div
              ref={timelineDrop}
              className="plan-rail plan-timeline"
              role="group"
              aria-label="时间轴安排"
              tabIndex={desktop ? 0 : undefined}
              onPointerDown={timelineDown}
              onPointerMove={timelineMove}
              onPointerUp={timelineEnd}
              onPointerCancel={timelineEnd}
              onLostPointerCapture={(e) => {
                if (e.target === e.currentTarget) railPan.current = null;
              }}
              onClickCapture={timelineClick}
            >
              <div className="plan-rail-strip">
                {timelineItems.map(renderCard)}
              </div>
              {!slots.length && (
                <div className="plan-axis-empty" aria-label="空白时间轴" />
              )}
            </div>
          </>
        ) : (
          <>
            <h2 className="plan-area-label">
              {upcoming ? "下周期设置" : "计划任务"}
            </h2>
            {goalBoard}
            {progressView}
          </>
        )}
        {upcoming && (
          <p className="plan-small" role="status">
            {liveCycle
              ? "已保存下周期设置，本期仍按原计划计算。"
              : "已保存，将从所选周期开始。"}
          </p>
        )}
        {closed && (
          <p className="plan-small">这个计划周期已结束，历史计划不可修改。</p>
        )}
        {error && <p role="alert">{error}</p>}
        <span className="sr-only" role="status">
          {arrival ? "已加入 " + arrival.name : ""}
        </span>
      </section>
      <PlanDivider desktop={desktop} state={layoutState} />
      <PlanSources
        s={s}
        now={now}
        plannedCards={plannedCards}
        cardFilter={cardFilter}
        setCardFilter={setCardFilter}
        open={open}
        begin={begin}
        editCard={editCard}
        deleteCard={deleteCard}
        desktop={desktop}
        board={board}
        gestures={gestures}
        goalBoard={goalBoard}
        progressView={progressView}
      />
      {drag &&
        createPortal(
          <div className="plan-drag-layer" aria-hidden="true">
            <div
              className="plan-drag-card gallery-card-paper"
              ref={gestures.dragElement}
              style={{ left: 0, top: 0 }}
            >
              <ActionCardFace
                card={drag.card}
                planned={plannedCards?.has(drag.card.id)}
              />
            </div>
          </div>,
          document.body,
        )}
      <PlanEditors board={board} now={now} />
    </div>
  );
}
