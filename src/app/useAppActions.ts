import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { confirmAction } from "../components";
import { saveCard as saveCardRecord } from "../engine";
import { savePurchasedShoppingCard } from "../cards/shopping-card";
import { preparePurchasedReceipt, saveRepairedShoppingArtwork } from "../cards/shopping-artwork";
import { prepareShoppingArtwork } from "../cards/shopping-card-image";
import type { ShoppingReceipt } from "../../shared/shopping-demo";
import type { SaveScope } from "../save-publication";
import { type Action, type Card, type Entry, type State } from "../model";
import { type PlanApplyChoice } from "../late-plan-edits";
import { application, type Result } from "../application/runtime";
import { isManageOperation, type ActionOutcome, type Command } from "../application/commands";
import { saveSnapshot } from "../save-publication";
import { clearCharacterDraftsForTesting } from "../local-data/registered-storage";
import type { Controls, Session } from "./types";
export function useAppActions({
  s,
  snapshot,
  startup,
  controls,
}: {
  s: Session["s"];
  snapshot: Session["snapshot"];
  startup: Session["startup"];
  controls: Controls;
}) {
  const { E, T, M, Q, Save, FocusId } = controls;
  const [planApplyPrompt, PlanApplyPrompt] = useState<{
    resolve: (choice: PlanApplyChoice | null) => void;
  } | null>(null);
  const saving = useSyncExternalStore(
    application.subscribeBusy,
    application.isBusy,
  );
  const busy = {
    get current() {
      return application.isBusy();
    },
  };
  const notify = (msg: string) => Q(msg);
  const pendingPlanChoice = useRef<
    ((choice: PlanApplyChoice | null) => void) | null
  >(null);
  const confirmationQueue = useRef<Promise<unknown>>(Promise.resolve());
  const uiActive = useRef(true);
  useEffect(() => {
    if (!snapshot) return;
    const { scope, state } = snapshot;
    let active = true;
    // Older automatically created cards bypassed artwork preparation. Repair once per save load.
    void (async () => {
      for (const card of state.cards) {
        if (!active || saveSnapshot()?.scope !== scope) break;
        if (!card.shopping || card.customArt || card.shopping.generatedArt?.transparent) continue;
        const product = await prepareShoppingArtwork(card.shopping, card.name);
        if (!active || saveSnapshot()?.scope !== scope) break;
        if (product.generatedArt?.transparent)
          await application.change((st, context) => saveRepairedShoppingArtwork(st, card, product.generatedArt, context), scope);
      }
    })();
    return () => { active = false; };
  }, [snapshot?.scope]);
  useEffect(() => {
    uiActive.current = true;
    const protect = (e: BeforeUnloadEvent) => {
      if (busy.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => {
      uiActive.current = false;
      pendingPlanChoice.current?.(null);
      window.removeEventListener("beforeunload", protect);
    };
  }, []);
  useEffect(() => {
    if (startup.phase !== "ready") return;
    FocusId(
      saveSnapshot()?.state.actions.find(
        (a) => a.endedAt === null && a.card.method !== "instant",
      )?.id || null,
    );
  }, [startup.phase]);
  async function present<T>(
    pending: Promise<Result<T>>,
    onError: (message: string) => void = E,
  ): Promise<Result<T>> {
    let result = await pending;
    while (result.status === "confirmation") {
      const request = result.request;
      const question = confirmationQueue.current.then(async () => {
        if (!uiActive.current) return null;
        return request.kind === "card"
          ? confirmAction(request.message, request.title)
          : new Promise<PlanApplyChoice | null>((resolve) => {
              pendingPlanChoice.current = resolve;
              PlanApplyPrompt({
                resolve: (choice) => {
                  pendingPlanChoice.current = null;
                  resolve(choice);
                },
              });
            });
      });
      confirmationQueue.current = question.catch(() => {});
      const answer = await question;
      result = await result.resume(answer);
    }
    if (result.status === "error") onError(result.message);
    if (
      result.status === "success" &&
      (!uiActive.current || snapshot?.scope !== saveSnapshot()?.scope)
    )
      return { status: "cancelled" };
    return result;
  }
  async function run(
    fn: (s: State) => unknown,
    onError?: (message: string) => void,
  ): Promise<boolean> {
    return (
      (await present(application.change(fn, snapshot?.scope), onError))
        .status === "success"
    );
  }
  async function saveCard(card: Card, original?: Card) {
    const result = await present(
      application.change((st, context) => {
        if (original && JSON.stringify(st.cards.find(({ id }) => id === original.id)) !== JSON.stringify(original))
          throw Error("原卡牌已变化，请重新打开后编辑。");
        saveCardRecord(st, card, context);
      }, snapshot?.scope),
    );
    return result.status === "success";
  }
  async function saveShoppingPurchase(receipt: ShoppingReceipt, scope: SaveScope, cardId?: string) {
    const current = saveSnapshot();
    if (!current || current.scope !== scope) throw Error("存档已更新，请重新检查付款状态。");
    const prepared = await preparePurchasedReceipt(current.state, receipt, cardId);
    const result = await application.change((state, context) => savePurchasedShoppingCard(state, prepared, context, cardId), scope);
    if (result.status === "success") return result.value;
    if (result.status === "error") throw Error(result.message);
    throw Error("存档已更新，请重新检查付款状态。");
  }
  async function reset() {
    if (busy.current || !s) return;
    try {
      await application.resetForTesting();
      clearCharacterDraftsForTesting();
      T("today");
      M(null);
      Save(null);
      Q("");
      E("");
    } catch (e) {
      E("重置未完成：" + (e as Error).message);
    }
  }
  function showAction(outcome: ActionOutcome) {
    if (outcome.kind === "completed") Save(outcome.entry);
    else if (outcome.kind === "focus") FocusId(outcome.actionId);
    else
      M({
        kind: outcome.kind === "settlement" ? "finish" : "abandon",
        id: outcome.actionId,
      });
  }
  async function complete(id: string) {
    const result = await present(
      application.execute({ type: "complete", actionId: id }, snapshot?.scope),
    );
    if (result.status === "success") showAction(result.value);
  }
  async function runAiAction(
    command: Extract<Command, { type: "start" | "record" | "complete" }>,
    scope: NonNullable<typeof snapshot>["scope"],
    onFocus?: (actionId: string) => void,
  ) {
    const result = await present(application.execute(command, scope), () => {});
    if (result.status === "error") throw Error(result.message);
    if (result.status !== "success") return;
    if (result.value.kind === "focus") onFocus?.(result.value.actionId);
    showAction(result.value);
    return result.value;
  }
  async function begin(
    c: Card,
    inlineCompletion = false,
  ): Promise<boolean | Entry> {
    const result = await present(
      application.execute({ type: "start", cardId: c.id }, snapshot?.scope),
    );
    if (result.status !== "success") return false;
    if (inlineCompletion && result.value.kind === "completed")
      return result.value.entry;
    showAction(result.value);
    return true;
  }
  function changeQuantity(id: string, quantity: number) {
    void present(
      application.execute(
        { type: "quantity", actionId: id, quantity },
        snapshot?.scope,
      ),
    );
  }
  function pauseAction(id: string) {
    void present(
      application.execute({ type: "pause", actionId: id }, snapshot?.scope),
    );
  }
  async function end(a: Action) {
    const result = await present(
      application.execute(
        { type: "complete", actionId: a.id, freeze: true },
        snapshot?.scope,
      ),
    );
    if (result.status === "success") showAction(result.value);
  }
  async function manage(type: string, id: string) {
    if (!isManageOperation(type)) return;
    const result = await present(
      application.execute(
        { type: "manage-card", cardId: id, operation: type },
        snapshot?.scope,
      ),
    );
    if (result.status === "success") {
      M(null);
      notify("卡牌已更新");
    }
  }
  async function removeJournalEntry(entryId: string) {
    const result = await present(
      application.execute({ type: "delete-entry", entryId }, snapshot?.scope),
    );
    if (result.status !== "success") return false;
    if (result.committed) notify("行动记录已删除");
    return true;
  }
  return {
    saving,
    saveCard,
    saveShoppingPurchase,
    busy,
    notify,
    planApplyPrompt,
    PlanApplyPrompt,
    present,
    run,
    reset,
    complete,
    runAiAction,
    begin,
    changeQuantity,
    pauseAction,
    end,
    manage,
    removeJournalEntry,
  };
}
