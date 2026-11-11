import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { tourPlanState, type TourScene } from "../guides/tour";
import type { Controls, Session, Navigation } from "./types";
export function useAppGuide({
  s,
  payments,
  controls,
  navigation,
}: {
  s: Session["s"];
  payments: Session["payments"];
  controls: Controls;
  navigation: Navigation;
}) {
  const { tab, T, collection, Collection } = controls;
  const {
    workspacePanel,
    WorkspacePanel,
    planCardFilter,
    PlanCardFilter,
    PanelDragging,
    PanelSettling,
  } = navigation;
  const [guidePreview, GuidePreviewOpen] = useState(false),
    [guideReview, GuideReview] = useState(false),
    [guideScene, GuideScene] = useState<TourScene | null>(null),
    [guideDismissed, GuideDismissed] = useState(false);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const request = (e: MessageEvent) => {
      if (
        window.parent !== window &&
        e.source === window.parent &&
        e.origin === location.origin &&
        e.data?.type === "statify-preview-tour"
      ) {
        T("today");
        GuideReview(true);
        GuideDismissed(false);
        GuidePreviewOpen(true);
      }
    };
    window.addEventListener("message", request);
    return () => window.removeEventListener("message", request);
  }, []);
  useEffect(() => {
    GuidePreviewOpen(false);
    GuideReview(false);
    GuideScene(null);
    GuideDismissed(false);
    guideOrigin.current = null;
  }, [s?.createdAt, payments.account?.id]);
  const guideRoute = useRef({
      tab,
      workspacePanel,
      collection,
      planCardFilter,
    }),
    guideOrigin = useRef<typeof guideRoute.current | null>(null);
  guideRoute.current = { tab, workspacePanel, collection, planCardFilter };
  const showGuideScene = useCallback((scene: TourScene) => {
    if (!guideOrigin.current) guideOrigin.current = { ...guideRoute.current };
    GuideScene(scene);
    T(
      ["warehouse", "plans", "timeline"].includes(scene)
        ? "workspace"
        : "today",
    );
    WorkspacePanel(
      scene === "plans" || scene === "timeline" ? "plans" : "cards",
    );
    PanelDragging(false);
    PanelSettling(false);
    Collection("all");
    PlanCardFilter("全部");
  }, []);
  const guideState = useMemo(
    () =>
      s && guideScene
        ? tourPlanState(s, Date.now(), guideScene === "timeline")
        : s,
    [s, guideScene],
  );
  return {
    guidePreview,
    GuidePreviewOpen,
    guideReview,
    GuideReview,
    guideScene,
    GuideScene,
    guideDismissed,
    GuideDismissed,
    guideOrigin,
    showGuideScene,
    guideState,
  };
}
