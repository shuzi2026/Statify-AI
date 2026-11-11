import { useEffect } from "react";
import {
  needsDefaultAttributes,
  restoreDefaultAttributes,
} from "../attribute-library";
import { dateKey } from "../engine";
import { accountTrialActive, memberActive } from "../payments/access";
import { application } from "../application/runtime";
import { Unchanged } from "../application/commands";
import { planMessages } from "../planning";
import type { Controls, Session, Actions } from "./types";
import { currentDraftEpoch } from "../local-data/draft-epoch";
import { recordRuntimeIssue } from "../runtime-diagnostics";
import { initialAppTab } from "./useAppControls";
export function useAppLifecycle({
  s,
  payments,
  hasMember,
  controls,
  actions,
}: {
  s: Session["s"];
  payments: Session["payments"];
  hasMember: boolean;
  controls: Controls;
  actions: Actions;
}) {
  const { E, T, M, toast, Q, now, saved, Save, Inspect, focusId, FocusId, modal } = controls;
  const today = dateKey(now),
    calendarNeedsUpdate =
      !!s &&
      (s.days.at(-1)?.date !== today || planMessages(s, now).notices.length > 0);
  useEffect(() => {
    const request = (e: MessageEvent) => {
      if (
        window.parent !== window &&
        e.source === window.parent &&
        e.origin === location.origin &&
        e.data?.type === "life-rpg-preview-reset"
      )
        M({ kind: "reset" });
    };
    window.addEventListener("message", request);
    return () => window.removeEventListener("message", request);
  }, []);
  useEffect(() => {
    M(null);
    T(initialAppTab());
    Save(null);
    Inspect(null);
  }, [s?.createdAt]);
  useEffect(() => {
    if (!s) return;
    // UI handles cannot keep a cancelled/completed action alive. Reconcile
    // every completion path, including direct settlement and external refresh.
    if (focusId && !s.actions.some(a => a.id === focusId && a.endedAt === null))
      FocusId(null);
    if ((modal?.kind === "finish" || modal?.kind === "abandon") &&
        !s.actions.some(a => a.id === modal.id)) M(null);
  }, [s?.actions, focusId, modal]);
  useEffect(() => {
    M(null);
    Save(null);
    Inspect(null);
    controls.CreatedCard(null);
    controls.FocusId(null);
    actions.planApplyPrompt?.resolve(null);
    actions.PlanApplyPrompt(null);
  }, [currentDraftEpoch()]);
  useEffect(() => {
    if (calendarNeedsUpdate)
      void application.maintainCalendar().catch((error) => {
        recordRuntimeIssue("error", error);
        E("暂时无法更新今天的数据。请重新打开应用后再试。");
      });
  }, [s, today, calendarNeedsUpdate]);
  useEffect(() => {
    if (
      s &&
      payments.ready &&
      (!payments.error || payments.entitlement) &&
      !hasMember &&
      needsDefaultAttributes(s, !accountTrialActive())
    ) {
      void application.change((st) => {
        const archiveCustom = !accountTrialActive();
        if (memberActive() || !needsDefaultAttributes(st, archiveCustom))
          throw new Unchanged(undefined);
        restoreDefaultAttributes(st, archiveCustom);
      }).then((result) => {
        if (result.status === "error" && result.code !== "conflict")
          E(result.message);
      });
    }
  }, [
    payments,
    hasMember,
    accountTrialActive(now),
    s?.createdAt,
    s?.attributes,
  ]);
  useEffect(() => {
    if (!toast) return;
    const i = setTimeout(() => Q(""), 3800);
    return () => clearTimeout(i);
  }, [toast]);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => Save(null), 1900);
    return () => clearTimeout(timer);
  }, [saved?.id]);
}
