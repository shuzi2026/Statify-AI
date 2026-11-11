import { Activity, type ReactNode } from "react";
import { ActionQuantity } from "../actions/ActionQuantity";
import { type Card } from "../model";
import { HomeCardFilter } from "../HomeCardFilter";
import { MobileHome } from "../MobileHome";
import { PlanBell } from "../PlanHUD";
import type { AppViewProps } from "./types";
export function AppHome({
  activity,
  s,
  mobile,
  controls,
  actions,
  navigation,
  guide,
  homeCards,
  plannedCards,
  children,
}: AppViewProps & { homeCards: Card[]; plannedCards?: ReadonlyMap<string, unknown>; children: ReactNode }) {
  const { tab, M, now, homeCollection, HomeCollection, FocusId } = controls;
  const current = tab === "today" || tab === "ai";
  const { complete, begin, changeQuantity, pauseAction, end, manage } = actions;
  const { homeScene, pageSlide, navigate, workspaceDrag, workspaceDrop } = navigation;
  const { guideScene } = guide;
  const { reminders, level, dailyProgress, timer, pending } = activity;
  const homeFilter = (
    <HomeCardFilter s={s} value={homeCollection} change={HomeCollection} />
  );
  return (
    <>
      {mobile && (
          <div
            ref={homeScene}
            className={
              "home-page " +
              (current ? "is-current " : "") +
              (pageSlide.settling ? "is-settling" : "")
            }
            hidden={!current && !pageSlide.active}
            inert={!current || pageSlide.active ? true : undefined}
            aria-hidden={!current || pageSlide.active || undefined}
          >
            <Activity mode={current || pageSlide.active ? "visible" : "hidden"}>
              <MobileHome
                mainContent={children}
                notification={
                  current && !pageSlide.active ? (
                    <PlanBell
                      s={s}
                      now={now}
                      progress={dailyProgress}
                      open={() => M({ kind: "messages" })}
                    />
                  ) : undefined
                }
                tourScene={guideScene || undefined}
                s={s}
                now={now}
                executionLevel={level.level}
                reminderCardId={reminders.live[0]?.cardId}
                dailyProgress={dailyProgress}
                cards={homeCards}
                plannedCards={plannedCards}
                filterControl={guideScene ? undefined : homeFilter}
                resetFilter={() => HomeCollection("all")}
                timer={timer}
                quantityInput={
                  timer && (
                    <ActionQuantity
                      key={timer.id}
                      action={timer}
                      change={(n) => changeQuantity(timer.id, n)}
                    />
                  )
                }
                pending={pending}
                openStatus={() => M({ kind: "status" })}
                openAttributes={() => M({ kind: "attributes" })}
                openMeter={(id) => M({ kind: "meter", id })}
                openWorkspace={() => navigate("workspace")}
                workspaceDrag={workspaceDrag}
                workspaceDrop={workspaceDrop}
                newCard={() => M({ kind: "card" })}
                deleteCard={(id) => void manage("delete", id)}
                editCard={(id) => M({ kind: "card", id })}
                begin={(c) => begin(c, true)}
                openSession={(id) => FocusId(id)}
                pauseTimer={pauseAction}
                finishTimer={(a) => void end(a)}
                openFinish={(id) => void complete(id)}
              />
            </Activity>
          </div>
        )}
    </>
  );
}
