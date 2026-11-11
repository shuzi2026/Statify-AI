import type { ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { CardTile } from "../cards/CardTile";
import type { PlanWorkspaceProps } from "./types";
import type { PlanBoard } from "./usePlanBoard";
import type { PlanGestures } from "./usePlanGestures";

export function PlanSources({
  s,
  now,
  plannedCards,
  cardFilter,
  setCardFilter,
  open,
  begin,
  editCard,
  deleteCard,
  desktop,
  board,
  gestures,
  goalBoard,
  progressView,
}: Pick<
  PlanWorkspaceProps,
  | "s"
  | "now"
  | "plannedCards"
  | "cardFilter"
  | "setCardFilter"
  | "open"
  | "begin"
  | "editCard"
  | "deleteCard"
> & {
  desktop: boolean;
  board: PlanBoard;
  gestures: PlanGestures;
  goalBoard: ReactNode;
  progressView: ReactNode;
}) {
  const { p, closed, add, source, Source } = board;
  const { drag, down, move, up, gesture, suppress } = gestures;
  const cards = s.cards.filter(
    (c) =>
      c.state === "active" && !c.shopping &&
      (cardFilter === "全部" ||
        (cardFilter === "未分类" ? !c.category : c.category === cardFilter)),
  );

  const libraryView = (
    <>
      <section
        className="plan-card-library workspace-scroll-area"
        aria-label="计划页可选卡牌"
      >
        <div className="card-grid">
          {cards.map((c) => (
            <div
              className={
                "plan-source" + (drag?.card.id === c.id ? " is-lifted" : "")
              }
              key={c.id}
              onPointerDown={(e) => down(e, c)}
              onPointerMove={move}
              onPointerUp={(e) => up(e)}
              onPointerCancel={(e) => up(e, true)}
              onLostPointerCapture={(e) => {
                if (e.target === e.currentTarget && gesture.current)
                  up(e, true);
              }}
              onClickCapture={(e) => {
                if (suppress.current) {
                  suppress.current = false;
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
            >
              <CardTile
                card={c}
                planned={plannedCards?.has(c.id)}
                surface="source"
                s={s}
                now={now}
                showActions={false}
                open={(source) => open(c, source)}
                begin={() => begin(c)}
                edit={() => editCard(c.id)}
                favorite={() => {}}
                remove={() => deleteCard(c.id)}
              />
              <button
                className="plan-drag-hint"
                aria-label={"加入计划 " + c.name}
                title="拖动卡牌"
                disabled={closed}
                onClick={() => void add(c)}
              >
                <GripVertical size={12} />
              </button>
            </div>
          ))}
        </div>
      </section>
      <aside className="workspace-categories plan-card-categories workspace-scroll-area">
        <nav aria-label="计划页卡牌分类">
          {[...new Set(["全部", "未分类", ...s.categories])].map((v) => (
            <button
              key={v}
              aria-pressed={cardFilter === v}
              onClick={() => setCardFilter(v)}
            >
              {v}
            </button>
          ))}
        </nav>
      </aside>
    </>
  );

  return (
    <section
      className={
        "plan-source-panel " +
        (p.timeline && source === "tasks"
          ? "is-task-source"
          : "is-warehouse-source")
      }
      aria-label="卡牌来源面板"
    >
      {desktop && !p.timeline && (
        <h2 className="desktop-source-heading">卡牌仓库</h2>
      )}{" "}
      {p.timeline && (
        <div
          className="plan-source-tabs"
          role="tablist"
          aria-label="时间轴卡牌来源"
        >
          {(
            [
              { id: "tasks", name: "计划任务" },
              { id: "warehouse", name: "卡牌仓库" },
            ] as const
          ).map((tab) => (
            <button
              role="tab"
              key={tab.id}
              aria-selected={source === tab.id}
              aria-controls={"plan-source-" + tab.id}
              id={"plan-source-tab-" + tab.id}
              tabIndex={source === tab.id ? 0 : -1}
              onClick={() => Source(tab.id)}
              onKeyDown={(e) => {
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                ) {
                  e.preventDefault();
                  e.stopPropagation();
                  const next =
                    e.key === "Home"
                      ? "tasks"
                      : e.key === "End"
                        ? "warehouse"
                        : source === "tasks"
                          ? "warehouse"
                          : "tasks";
                  Source(next);
                  requestAnimationFrame(() =>
                    document.getElementById("plan-source-tab-" + next)?.focus(),
                  );
                }
              }}
            >
              {tab.name}
            </button>
          ))}
        </div>
      )}
      {p.timeline && source === "tasks" ? (
        <div
          id="plan-source-tasks"
          role="tabpanel"
          aria-labelledby="plan-source-tab-tasks"
          className="plan-task-source"
        >
          {goalBoard}
          {progressView}
        </div>
      ) : (
        <div
          id="plan-source-warehouse"
          role={p.timeline ? "tabpanel" : undefined}
          aria-labelledby={p.timeline ? "plan-source-tab-warehouse" : undefined}
          className="plan-warehouse-source"
        >
          {libraryView}
        </div>
      )}
    </section>
  );
}
