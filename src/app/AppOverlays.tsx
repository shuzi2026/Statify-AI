import { Plus } from "lucide-react";
import { lazy, Suspense } from "react";
import { ToastNotice } from "../ToastNotice";
import { Dialog } from "../components";
import { addCardFromTemplate } from "../engine";
import { AttributeManager } from "../attributes/AttributeManager";
import { CardForm } from "../cards/CardForm";
import { MeterForm } from "../meters/MeterForm";
import { templates } from "../model";
import { MemberNotice } from "../payments/MemberNotice";
import { SettlementFlow } from "../ActionFlow";
import { FocusSession } from "../actions/FocusSession";
import { CardCreated } from "../CardCreated";
import { CompletionNotice } from "../CompletionNotice";
import { LatePlanApplyDialog } from "../LatePlanApplyDialog";
import { CardDetailView } from "../cards/CardDetailView";
import { Onboarding } from "../Onboarding";
import { PlanMessages } from "../PlanHUD";
import { application } from "../application/runtime";
import { CharacterSetup } from "../themes/ThemeChooser";
import type { AppViewProps, Session } from "./types";
import { AbandonDialog } from "../actions/AbandonDialog";
import { StatusDialog } from "../home/StatusDialog";
import { InitialDialog } from "../attributes/InitialDialog";
import { PreferenceIssueDialog } from "./PreferenceIssueDialog";
const GuidePreview = lazy(() => import("../guides/GuidePreview"));
export function AppOverlays({
  subscribedSnapshot,
  activity,
  s,
  payments,
  controls,
  actions,
  navigation,
  guide,
  openAiDuringFocus,
  focusInChat,
}: AppViewProps & {
  subscribedSnapshot: Session["snapshot"];
  openAiDuringFocus?: () => void;
  focusInChat: boolean;
}) {
  const {
    error,
    E,
    tab,
    T,
    modal,
    M,
    toast,
    now,
    Collection,
    saved,
    Save,
    FocusId,
    createdCard,
    CreatedCard,
    inspected,
    Inspect,
  } = controls;
  const {
    saving,
    busy,
    notify,
    planApplyPrompt,
    PlanApplyPrompt,
    present,
    run,
    reset,
    begin,
    changeQuantity,
    pauseAction,
    end,
    manage,
  } = actions;
  const { WorkspacePanel, PlanCardFilter } = navigation;
  const {
    guidePreview,
    GuidePreviewOpen,
    guideReview,
    guideScene,
    GuideScene,
    guideDismissed,
    GuideDismissed,
    guideOrigin,
    showGuideScene,
  } = guide;
  const { activeFinish, focusAction } = activity;
  const snapshot = subscribedSnapshot;
  return (
    <>
      {!s.profile.onboarded && (
        <CharacterSetup key={s.createdAt} s={s} run={run} />
      )}
      {planApplyPrompt && (
        <LatePlanApplyDialog
          answer={(choice) => {
            PlanApplyPrompt(null);
            planApplyPrompt.resolve(choice);
          }}
        />
      )}
      {!guideDismissed &&
        (guidePreview || s.homeTourPending) &&
        s.profile.onboarded &&
        (tab === "today" || guideScene !== null) &&
        !modal &&
        !focusAction &&
        !activeFinish &&
        !inspected &&
        !createdCard && (
          <Suspense fallback={null}>
            <GuidePreview
              key={(payments.account?.id || "local") + ":" + s.createdAt}
              preview={guideReview}
              showScene={showGuideScene}
              close={() => {
                GuideDismissed(true);
                GuidePreviewOpen(false);
                GuideScene(null);
                const origin = guideOrigin.current;
                guideOrigin.current = null;
                T(origin?.tab || "today");
                if (origin) {
                  WorkspacePanel(origin.workspacePanel);
                  Collection(origin.collection);
                  PlanCardFilter(origin.planCardFilter);
                }
                if (s.homeTourPending)
                  void run((st) => {
                    st.homeTourPending = false;
                  });
              }}
            />
          </Suspense>
        )}
      {inspected && s.cards.find((c) => c.id === inspected.id) && (
        <CardDetailView
          key={inspected.id}
          card={s.cards.find((c) => c.id === inspected.id)!}
          s={s}
          now={now}
          source={inspected.source}
          remove={() => void manage("delete", inspected.id)}
          close={() => Inspect(null)}
          edit={() => {
            Inspect(null);
            M({ kind: "card", id: inspected.id });
          }}
          begin={async () => {
            const c = s.cards.find((c) => c.id === inspected.id)!,
              ok = await begin(c, true);
            if (ok === true) Inspect(null);
            return ok;
          }}
        />
      )}
      {modal?.kind === "abandon" && (
        <AbandonDialog
          close={() => M(null)}
          abandon={async () => {
            if (
              (
                await present(
                  application.execute(
                    { type: "cancel-action", actionId: modal.id },
                    snapshot?.scope,
                  ),
                )
              ).status === "success"
            ) {
              FocusId(null);
              M(null);
            }
          }}
        />
      )}
      {modal?.kind === "card" && (
        <CardForm
          key={modal.id || "new"}
          s={s}
          initial={modal.suggested?.original ?? s.cards.find((c) => c.id === modal.id)}
          startShopping={modal.shopping}
          suggested={modal.suggested?.changes}
          close={() => M(null)}
          save={(card, original) => actions.saveCard(card, modal.suggested?.original ?? original)}
          manage={manage}
          created={(c) => {
            M(null);
            CreatedCard(c);
          }}
        />
      )}
      {modal?.kind === "templates" && (
        <Dialog title="选一件，想做的小事。" close={() => M(null)}>
          <div className="template-list">
            {[...templates(Date.now()), ...s.cardTemplates].map((c) => (
              <button
                key={c.id}
                onClick={async () => {
                  if (
                    (await present(application.change(
                      (st, context) => addCardFromTemplate(st, c, context),
                      snapshot?.scope,
                    ))).status === "success"
                  ) {
                    M(null);
                    notify("已加入 " + c.name);
                  }
                }}
              >
                <span>
                  <strong>{c.name}</strong>
                  <small>{c.description}</small>
                </span>
                <Plus size={20} />
              </button>
            ))}
          </div>
          <p className="help">这些只是起点，每张都可以再编辑。</p>
        </Dialog>
      )}
      {focusAction && !focusInChat && (
        <FocusSession
          action={focusAction}
          busy={saving}
          changeQuantity={(n) => changeQuantity(focusAction.id, n)}
          pause={() => pauseAction(focusAction.id)}
          finish={() => void end(focusAction)}
          openAi={openAiDuringFocus}
        />
      )}
      {activeFinish && (
        <SettlementFlow
          key={activeFinish.id}
          action={activeFinish}
          s={s}
          submit={async (command) => {
            const result = await present(
              application.execute(command, snapshot?.scope),
            );
            return result.status === "success" ? result.value : undefined;
          }}
          cancelReported={async () => {
            const result = await present(application.execute(
              { type: "cancel-action", actionId: activeFinish.id }, snapshot?.scope,
            ));
            if (result.status === "success") M(null);
          }}
          done={(e) => {
            Save(e);
            FocusId(null);
            M(null);
          }}
        />
      )}
      {createdCard && (
        <CardCreated
          card={s.cards.find((c) => c.id === createdCard.id) || createdCard}
          close={() => CreatedCard(null)}
          save={actions.saveCard}
        />
      )}
      {modal?.kind === "status" && (
        <StatusDialog s={s} run={run} suggested={modal.suggested} close={() => M(null)} />
      )}
      {modal?.kind === "meter" && (
        <MeterForm
          key={modal.id ?? "new"}
          initial={s.meters.find((m) => m.id === modal.id)}
          suggested={modal.suggested}
          remove={async (meterId) => (await present(
            application.execute({ type: "delete-meter", meterId }, snapshot?.scope),
          )).status === "success"}
          run={run}
          close={() => M(null)}
        />
      )}
      {modal?.kind === "attributes" && (
        <AttributeManager s={s} run={run} close={() => M(null)} />
      )}
      {modal?.kind === "guide" && (
        <Onboarding s={s} run={run} preview close={() => M(null)} />
      )}
      {modal?.kind === "reset" && (
        <Dialog
          title="重置测试数据"
          dismissible={!saving}
          close={() => M(null)}
        >
          <p>
            确认后，当前人物、卡牌、计划和行动记录会被替换为全新存档，并从新手引导第一步开始。
          </p>
          <p>
            调试重置不保留当前测试数据，也不生成备份；未提交的填写草稿会一起清除。
          </p>
          <footer className="dialog-actions">
            <button disabled={saving} onClick={() => M(null)}>
              取消
            </button>
            <button
              disabled={saving}
              className="danger"
              onClick={() => void reset()}
            >
              {saving ? "正在重置…" : "重置并重新开始"}
            </button>
          </footer>
        </Dialog>
      )}
      {modal?.kind === "initial" && (
        <InitialDialog s={s} run={run} suggested={modal.suggested} close={() => M(null)} />
      )}
      {modal?.kind === "messages" && (
        <PlanMessages
          s={s}
          now={now}
          progress={activity.dailyProgress}
          saving={saving}
          close={() => M(null)}
          read={(ids) =>
            void run((st) => {
              for (const m of st.messages)
                if (ids.has(m.id)) m.read = true;
            })
          }
          start={(id) => {
            const c = s.cards.find((c) => c.id === id);
            if (!c || busy.current) return;
            if (c.method === "instant") {
              void begin(c, true);
              return;
            }
            M(null);
            void begin(c);
          }}
        />
      )}
      {saved && (
        <div
          className={
            "completed-animation" +
            (saved.method === "instant" ? " is-instant" : "")
          }
          key={saved.id}
          onAnimationEnd={() => Save(null)}
          aria-hidden
        >
          <CompletionNotice
            entry={saved}
            message={s.cards.find((c) => c.id === saved.cardId)?.message}
          />
        </div>
      )}
      {toast && <ToastNotice message={toast} />}
      {error && (
        <Dialog title="还差一步" close={() => E("")}>
          {/会员|权益|试用/.test(error) ? (
            <MemberNotice pulse={1}>{error}</MemberNotice>
          ) : (
            <p role="alert">{error}</p>
          )}
          <footer className="dialog-actions single-action">
            <button className="primary" onClick={() => E("")}>
              知道了
            </button>
          </footer>
        </Dialog>
      )}
      <PreferenceIssueDialog
        available={
          s.profile.onboarded &&
          !modal && !focusAction && !activeFinish && !inspected &&
          !createdCard && !planApplyPrompt && !error &&
          (guideDismissed || (!guidePreview && !s.homeTourPending))
        }
      />
    </>
  );
}
