import { Activity, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { SettingsPage } from "./SettingsPage";
import { dateKey, execution } from "./engine";
import { download, recoveryBackup } from "./storage";
import { dailyPlanProgress, planMessages } from "./planning";
import { Journal } from "./Journal";
import {
  collectionContext,
  collectionOptions,
  selectCards,
} from "./card-collection";
import { useAppSession } from "./app/useAppSession";
import { useAppControls } from "./app/useAppControls";
import { useAppActions } from "./app/useAppActions";
import { useWorkspaceNavigation } from "./app/useWorkspaceNavigation";
import { useAppGuide } from "./app/useAppGuide";
import { useAppLifecycle } from "./app/useAppLifecycle";
import { AppSidebar, AppHeader, AppNavigation } from "./app/AppChrome";
import { AppNotices } from "./app/AppNotices";
import { AppHome } from "./app/AppHome";
import { AppWorkspace } from "./app/AppWorkspace";
import { AiChat } from "./app/AiChat";
import { ShoppingDemo } from "./app/ShoppingDemo";
import { DISH_SOAP_PRODUCT_ID, inferShoppingKind, type ShoppingComparison } from "../shared/shopping-demo";
import type { Card } from "./model";
import { isHackathonPreview } from "./payments/preview-access";
import { AppOverlays } from "./app/AppOverlays";
import { useRemoteTimerId } from "./cloud/client";
import { RemoteTimerStatus } from "./cloud/RemoteTimerStatus";
import { currentDraftEpoch } from "./local-data/draft-epoch";
import { recordRuntimeIssue } from "./runtime-diagnostics";
import { prepareLegacyPagePaint } from "./legacy-styles";
const shoppingDemoEnabled = isHackathonPreview() || import.meta.env.DEV && import.meta.env.VITE_STATIFY_REGION === "global";

export default function App() {
  const [shopping, setShopping] = useState<{ open: boolean; catalog?: ShoppingComparison; card?: Card }>({ open: false });
  const [focusChatId, setFocusChatId] = useState<string | null>(null);
  const session = useAppSession();
  const { s, payments, hasMember, startup, mobile, snapshot, bootError } =
    session;
  const dawnCard = s?.cards.find((card) => card.state === "active" && card.shopping &&
    (card.shopping.kind === "Dish soap" || inferShoppingKind(card.name) === "Dish soap" || card.shopping.productId === DISH_SOAP_PRODUCT_ID));
  const openShoppingCard = shoppingDemoEnabled ? () => setShopping({ open: true, card: dawnCard }) : undefined;
  const openSavedShoppingCard = (card: Card) => {
    if (shoppingDemoEnabled) setShopping({ open: true, card });
    else if (card.shopping) window.open(card.shopping.url, "_blank", "noopener,noreferrer");
  };
  const remoteTimerId = useRemoteTimerId(s);
  const controls = useAppControls(
    s,
    payments.entitlement?.initial_adjustment_until,
  );
  const actions = useAppActions({ s, snapshot, startup, controls });
  const navigation = useWorkspaceNavigation({
    s,
    mobile,
    controls,
    busy: actions.busy,
  });
  const guide = useAppGuide({ s, payments, controls, navigation });
  useAppLifecycle({ s, payments, hasMember, controls, actions });
  const {
    collection,
    Collection,
    homeCollection,
    HomeCollection,
    now,
    tab,
    T,
    M,
    E,
    modal,
    focusId,
    recoveryError,
    RecoveryError,
    CreatedCard,
  } = controls;
  const { run, notify } = actions;
  const { pageSlide } = navigation;
  const ready = !!s;
  const planPaneMounted =
    !mobile || navigation.plansOpened || navigation.workspacePanel === "plans";
  useLayoutEffect(() => {
    if (ready) prepareLegacyPagePaint();
  }, [
    ready,
    tab,
    mobile,
    pageSlide.active,
    planPaneMounted,
  ]);
  const { guideScene, GuideReview, GuideDismissed, GuidePreviewOpen } = guide;
  useEffect(() => {
    if (!s) return;
    if (!collectionOptions(s, false, shoppingDemoEnabled).some((item) => item.id === collection))
      Collection("all");
    if (!collectionOptions(s, true).some((item) => item.id === homeCollection))
      HomeCollection("all");
  }, [s, collection, homeCollection]);
  const context = useMemo(
    () => (s ? collectionContext(s, now) : null),
    [s, dateKey(now)],
  );
  const minuteBucket = Math.floor(now / 60000);
  const cards = useMemo(
    () => (s && context ? selectCards(s, collection, now, context) : []),
    [s, collection, context, minuteBucket],
  );
  const homeCards = useMemo(
    () =>
      s && context
        ? selectCards(s, guideScene ? "all" : homeCollection, now, context).filter((card) => !card.shopping)
        : [],
    [s, homeCollection, guideScene, context, minuteBucket],
  );
  if (bootError)
    return (
      <main className="boot">
        <h1>先保留你的数据</h1>
        <p role="alert">{recoveryError || bootError}</p>
        <button
          onClick={() =>
            void recoveryBackup()
              .then((raw) => download(raw, "Statify-原始存档.json"))
              .catch((error) => {
                recordRuntimeIssue("error", error);
                RecoveryError("原始存档暂时无法导出，请保留此页面并稍后重试。");
              })
          }
        >
          导出原始存档
        </button>
        <button onClick={() => location.reload()}>重试</button>
      </main>
    );
  if (!s)
    return (
      <main className="boot">
        <span className="loading-orb" />
        <p>正在整理你的空间…</p>
      </main>
    );
  const reminders = planMessages(s, now),
    level = execution(s, now),
    dailyProgress = dailyPlanProgress(s, now),
    timer = s.actions.find(
      (a) =>
        ["duration", "timed", "quantity"].includes(a.card.method) &&
        a.id !== remoteTimerId &&
        a.endedAt === null,
    ),
    pending = s.actions.filter(
      (a) => a.endedAt !== null && a.id !== remoteTimerId,
    ),
    // A committed end must immediately stay behind settlement's modal barrier,
    // including reload/recovery before the original command callback resumes.
    activeFinish =
      (modal?.kind === "finish"
        ? pending.find((a) => a.id === modal.id)
        : undefined) || pending[0];
  const focusAction =
    s.actions.find(
      (a) => a.id === focusId && a.endedAt === null && a.id !== remoteTimerId,
    ) ||
    s.actions.find(
      (a) =>
        a.endedAt === null &&
        a.card.method !== "instant" &&
        a.id !== remoteTimerId,
    );
  const focusInChat = (tab === "ai" || mobile && tab === "today") && !!focusAction && focusAction.id === focusChatId;
  const remoteAction = s.actions.find((a) => a.id === remoteTimerId);
  const activity = {
    reminders,
    level,
    dailyProgress,
    timer,
    pending,
    activeFinish,
    focusAction,
  };
  const view = {
    s,
    mobile,
    payments,
    controls,
    actions,
    navigation,
    guide,
    activity,
  };
  const chat = (
    <AiChat
      compact={mobile}
      state={s}
      now={now}
      openEditor={M}
      openShoppingCard={openShoppingCard}
      openComparison={shoppingDemoEnabled ? (comparison) => {
        setShopping((current) => current.open ? current : { open: true, catalog: comparison });
      } : undefined}
      runAiAction={actions.runAiAction}
      present={actions.present}
      chatTimer={focusInChat ? focusAction : undefined}
      returnToTimer={() => setFocusChatId(null)}
      openWalkInChat={setFocusChatId}
      saveCard={async (card) => {
        const saved = await actions.saveCard(card);
        if (saved) {
          Collection("all");
          CreatedCard(card);
        }
        return saved;
      }}
    />
  );
  return (
    <div
      key={currentDraftEpoch() || "legacy-inputs"}
      className={
        "app-shell simulator-shell " +
        (!mobile && tab === "workspace" && navigation.workspacePanel === "plans"
          ? "plan-workspace-expanded "
          : "") +
        (pageSlide.active ? "is-page-sliding" : "")
      }
    >
      <AppSidebar {...view} />
      <main
        data-page={tab}
        className={
          !mobile && (tab === "workspace" || tab === "today" || tab === "ai")
            ? "workspace-main"
            : undefined
        }
      >
        <AppHeader {...view} />
        {remoteAction && <RemoteTimerStatus action={remoteAction} />}
        <AppNotices {...view} />
        <AppHome {...view} homeCards={homeCards} plannedCards={context?.periods}>{mobile && chat}</AppHome>
        <AppWorkspace {...view} cards={cards} plannedCards={context?.periods}
          openShopping={openSavedShoppingCard} shoppingEnabled={shoppingDemoEnabled} />
        {!mobile && <Activity mode={tab === "ai" ? "visible" : "hidden"}>{chat}</Activity>}
        {tab === "journal" && (
          <Journal s={s} run={run} removeEntry={actions.removeJournalEntry} />
        )}
        {tab === "settings" && (
          <SettingsPage
            s={s}
            run={run}
            notify={notify}
            error={E}
            openInitial={() => M({ kind: "initial" })}
            openGuide={() => {
              GuideReview(false);
              GuideDismissed(false);
              GuidePreviewOpen(true);
              T("today");
            }}
            openReset={() => M({ kind: "reset" })}
          />
        )}
      </main>
      <AppNavigation {...view} />
      <AppOverlays {...view} subscribedSnapshot={snapshot} focusInChat={focusInChat}
        openAiDuringFocus={focusAction && (import.meta.env.DEV || isHackathonPreview()) ? () => {
          setFocusChatId(focusAction.id);
          T(mobile ? "today" : "ai");
        } : undefined} />
      {shoppingDemoEnabled && <ShoppingDemo key={s.createdAt} profileCreatedAt={s.createdAt} open={shopping.open}
        entries={s.entries} cards={s.cards}
        savedCard={shopping.card} savePurchase={actions.saveShoppingPurchase}
        catalog={shopping.catalog} setOpen={(open) => setShopping((current) => open ? { ...current, open } : { open })} />}
    </div>
  );
}
