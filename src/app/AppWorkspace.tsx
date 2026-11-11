import { Activity, type ReactNode } from "react";
import { DesktopCardMotion } from "../DesktopCardMotion";
import { CardWorkspace } from "../cards/CardWorkspace";
import { PlanWorkspace } from "../PlanWorkspace";
import type { AppViewProps } from "./types";
import type { Card } from "../model";
export function AppWorkspace({
  s,
  mobile,
  controls,
  actions,
  navigation,
  guide,
  cards,
  plannedCards,
  shoppingEnabled,
  openShopping,
}: AppViewProps & {
  cards: Card[];
  plannedCards?: ReadonlyMap<string, unknown>;
  shoppingEnabled?: boolean;
  openShopping: (card: Card) => void;
}) {
  const { tab, M, now, collection, Collection, Inspect } = controls;
  const { run, begin, manage } = actions;
  const {
    workspacePanel,
    plansOpened,
    workspaceVisited,
    planCardFilter,
    PlanCardFilter,
    panelTrack,
    panelDragging,
    panelSettling,
    workspaceScene,
    switchWorkspace,
    panelDown,
    panelMove,
    panelEnd,
    pageSlide,
    updateScrollGesture,
    backDown,
    backMove,
    backEnd,
    backSuppress,
  } = navigation;
  const { guideScene, guideState } = guide;
  const visible =
    tab === "workspace" || (!mobile && tab === "today") || pageSlide.active;

  return (
    <Activity mode={visible ? "visible" : "hidden"}>
      {(visible || (mobile && workspaceVisited)) && (
        <div
          ref={workspaceScene}
          hidden={!visible}
          className={
            "workspace-scene " +
            (pageSlide.active ? "is-incoming " : "") +
            (pageSlide.settling ? "is-settling" : "")
          }
          inert={
            pageSlide.active && pageSlide.direction === "forward"
              ? true
              : undefined
          }
          aria-hidden={
            !visible || (pageSlide.active && pageSlide.direction === "forward") || undefined
          }
          style={mobile ? { touchAction: "pan-y" } : undefined}
          onScrollCapture={(e) => {
            const el = e.target as HTMLElement;
            if (el.matches(".workspace-scroll-area")) updateScrollGesture(el);
          }}
          onPointerDown={(e) => {
            panelDown(e);
            backDown(e);
          }}
          onPointerMove={(e) => {
            if (!panelMove(e)) backMove(e);
          }}
          onPointerUp={(e) => {
            if (!panelEnd(e)) backEnd(e);
          }}
          onPointerCancel={(e) => {
            if (!panelEnd(e, true)) backEnd(e, true);
          }}
          onLostPointerCapture={(e) => {
            if (e.target === e.currentTarget) {
              if (!panelEnd(e, true)) backEnd(e, true);
            }
          }}
          onClickCapture={(e) => {
            if (backSuppress.current && e.detail !== 0) {
              backSuppress.current = false;
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <WorkspaceFolder active={workspacePanel}>
            <div className="workspace-heading">
              <div
                className="workspace-tabs"
                role="tablist"
                aria-label="卡牌与计划"
                onKeyDown={(e) => {
                  if (
                    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                  ) {
                    e.preventDefault();
                    const next =
                      e.key === "Home"
                        ? "cards"
                        : e.key === "End"
                          ? "plans"
                          : workspacePanel === "cards"
                            ? "plans"
                            : "cards";
                    switchWorkspace(next);
                    document.getElementById("workspace-tab-" + next)?.focus();
                  }
                }}
              >
                {(
                  [
                    { id: "cards", title: "我的卡牌" },
                    { id: "plans", title: "我的计划" },
                  ] as const
                ).map((p) => (
                  <button
                    className="workspace-tab"
                    type="button"
                    key={p.id}
                    id={"workspace-tab-" + p.id}
                    role="tab"
                    aria-selected={workspacePanel === p.id}
                    aria-controls={"workspace-panel-" + p.id}
                    tabIndex={workspacePanel === p.id ? 0 : -1}
                    onClick={() => switchWorkspace(p.id)}
                  >
                    <h1>{p.title}</h1>
                  </button>
                ))}
              </div>
            </div>
            <div className="workspace-panel-viewport">
              <div className="workspace-panels-clip">
                <div
                  ref={panelTrack}
                  className={
                    "workspace-panels " +
                    (panelDragging ? "is-panel-dragging " : "") +
                    (panelDragging || panelSettling ? "is-panel-sliding" : "")
                  }
                >
                  <div
                    id="workspace-panel-cards"
                    role="tabpanel"
                    aria-labelledby="workspace-tab-cards"
                    className="workspace-pane"
                    aria-hidden={
                      workspacePanel !== "cards" ||
                      panelDragging ||
                      panelSettling
                    }
                    inert={
                      workspacePanel !== "cards" ||
                      panelDragging ||
                      panelSettling
                    }
                  >
                    <CardWorkspace
                      s={s}
                      now={now}
                      cards={cards}
                      plannedCards={plannedCards}
                      collection={collection}
                      Collection={Collection}
                      run={run}
                      Inspect={Inspect}
                      begin={begin}
                      manage={manage}
                      create={() => M({ kind: "card", shopping: collection === "shopping" })}
                      edit={(id) => M({ kind: "card", id })}
                      templates={() => M({ kind: "templates" })}
                      shoppingEnabled={shoppingEnabled}
                      openShopping={openShopping}
                    />
                  </div>
                  <div
                    id="workspace-panel-plans"
                    role="tabpanel"
                    aria-labelledby="workspace-tab-plans"
                    className="workspace-pane"
                    aria-hidden={
                      workspacePanel !== "plans" ||
                      panelDragging ||
                      panelSettling
                    }
                    inert={
                      workspacePanel !== "plans" ||
                      panelDragging ||
                      panelSettling
                    }
                  >
                    {visible && (!mobile || workspacePanel === "plans" || plansOpened) && (
                      <PlanWorkspace
                        plannedCards={plannedCards}
                        readOnlyDemo={!!guideScene}
                        s={guideState || s}
                        now={now}
                        cardFilter={planCardFilter}
                        setCardFilter={PlanCardFilter}
                        run={guideScene ? async () => false : run}
                        open={(c, source) => Inspect({ id: c.id, source })}
                        deleteCard={(id) => void manage("delete", id)}
                        editCard={(id) => M({ kind: "card", id })}
                        begin={(c) => void begin(c)}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </WorkspaceFolder>
          {!mobile && <DesktopCardMotion plans={workspacePanel === "plans"} />}
        </div>
      )}
    </Activity>
  );
}
function WorkspaceFolder({
  active,
  children,
}: {
  active: "cards" | "plans";
  children: ReactNode;
}) {
  return (
    <div className="workspace-folder" data-workspace-active={active}>
      {children}
    </div>
  );
}
