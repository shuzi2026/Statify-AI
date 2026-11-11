import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import type { Controls, Session, Actions } from "./types";

const idleSlide = { active: false, settling: false, direction: "forward" as const };

export function useWorkspaceNavigation({
  s,
  mobile,
  controls,
  busy,
}: {
  s: Session["s"];
  mobile: boolean;
  controls: Controls;
  busy: Actions["busy"];
}) {
  const { tab, T, modal, collection, inspected } = controls;
  const [workspacePanel, WorkspacePanel] = useState<"cards" | "plans">("cards"),
    [plansOpened, PlansOpened] = useState(false),
    [workspaceVisited, WorkspaceVisited] = useState(false),
    [planCardFilter, PlanCardFilter] = useState("全部"),
    [panelDragging, PanelDragging] = useState(false),
    [panelSettling, PanelSettling] = useState(false),
    panelTrack = useRef<HTMLDivElement>(null),
    workspaceScene = useRef<HTMLDivElement>(null),
    homeScene = useRef<HTMLDivElement>(null),
    panelTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    panelGesture = useRef<{
      pointer: number;
      x: number;
      y: number;
      width: number;
      dragging: boolean;
    } | null>(null);
  useLayoutEffect(() => {
    if (!panelDragging) panelTrack.current?.style.removeProperty("transform");
  }, [workspacePanel, panelDragging]);
  function settlePanels() {
    if (panelTimer.current) clearTimeout(panelTimer.current);
    PanelSettling(true);
    panelTimer.current = setTimeout(
      () => PanelSettling(false),
      matchMedia("(prefers-reduced-motion:reduce)").matches ? 0 : 360,
    );
  }
  function switchWorkspace(panel: "cards" | "plans") {
    if (!mobile) {
      desktopView(panel);
      return;
    }
    if (panel !== workspacePanel) {
      if (panel === "plans") PlansOpened(true);
      settlePanels();
      WorkspacePanel(panel);
    }
    workspaceScene.current?.scrollTo({ top: 0 });
  }
  function panelDown(e: PointerEvent<HTMLDivElement>) {
    backSuppress.current = false;
    if (
      e.button !== 0 ||
      !e.isPrimary ||
      modal ||
      inspected ||
      pageSlide.active ||
      (e.target as HTMLElement).closest(
        "dialog,input,select,textarea,.category-wheel,.workspace-tabs,.workspace-categories,.workspace-pane-tools,.plan-source,.plan-selectors,.plan-goal-fields,.plan-board-controls",
      )
    )
      return;
    panelGesture.current = {
      pointer: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      width: 0,
      dragging: false,
    };
  }
  function panelMove(e: PointerEvent<HTMLDivElement>) {
    const g = panelGesture.current;
    if (!g || g.pointer !== e.pointerId) return false;
    // A nested gesture can consume pointerup. Hover must never resume it.
    if (e.buttons === 0) {
      panelEnd(e, true);
      return false;
    }
    const dx = e.clientX - g.x,
      dy = e.clientY - g.y;
    if (!g.dragging) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        panelGesture.current = null;
        return false;
      }
      if (Math.abs(dx) <= 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return false;
      g.dragging = true;
      g.width = e.currentTarget.clientWidth;
      backGesture.current = null;
      e.currentTarget.setPointerCapture(e.pointerId);
      PanelDragging(true);
      if (panelTimer.current) clearTimeout(panelTimer.current);
      PanelSettling(false);
    }
    if (workspacePanel === "cards" && dx < 0 && !plansOpened) PlansOpened(true);
    backSuppress.current = true;
    e.preventDefault();
    const offset =
      (workspacePanel === "cards" && dx > 0) ||
        (workspacePanel === "plans" && dx < 0)
        ? dx * 0.12
        : Math.max(-g.width, Math.min(g.width, dx));
    if (panelTrack.current)
      panelTrack.current.style.transform =
        `translate3d(calc(${workspacePanel === "plans" ? -50 : 0}% + ${offset}px),0,0)`;
    return true;
  }
  function panelEnd(e: PointerEvent<HTMLDivElement>, cancel = false) {
    const g = panelGesture.current;
    if (!g || g.pointer !== e.pointerId) return false;
    panelGesture.current = null;
    if (!g.dragging) return false;
    const dx = e.clientX - g.x;
    PanelDragging(false);
    settlePanels();
    if (!cancel && workspacePanel === "cards" && dx < -60)
      switchWorkspace("plans");
    else if (!cancel && workspacePanel === "plans" && dx > 60)
      switchWorkspace("cards");
    return true;
  }
  useEffect(() => {
    const stop = () => {
      panelGesture.current = null;
      PanelDragging(false);
    };
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("blur", stop);
      if (panelTimer.current) clearTimeout(panelTimer.current);
    };
  }, []);
  const [pageSlide, setPageSlide] = useState<{
    active: boolean;
    settling: boolean;
    direction: "forward" | "back";
  }>(idleSlide);
  const slideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideDistance = useRef(0);
  const slideHeight = useRef(0);
  useLayoutEffect(() => {
    // The viewport only changes on resize. Reading innerHeight while moving
    // the panels forces WebView to lay out the scene before each transform.
    const update = () => {
      slideHeight.current = window.innerHeight;
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  // The drag moves the two existing surfaces. React only commits the start,
  // release and end so the card grid does not rerender on each pointer event.
  function paintPageSlide(direction: "forward" | "back") {
    const home = homeScene.current, workspace = workspaceScene.current;
    if (!home || !workspace) return;
    const distance = slideDistance.current, height = slideHeight.current;
    home.style.transform = `translate3d(0,${direction === "back" ? distance - height : -distance}px,0)`;
    workspace.style.transform = `translate3d(0,${direction === "back" ? distance : height - distance}px,0)`;
  }
  useLayoutEffect(() => {
    if (pageSlide.active) paintPageSlide(pageSlide.direction);
    else {
      homeScene.current?.style.removeProperty("transform");
      workspaceScene.current?.style.removeProperty("transform");
    }
  }, [pageSlide]);
  function prepareWorkspace() {
    if (panelTimer.current) clearTimeout(panelTimer.current);
    WorkspacePanel("cards");
    PlansOpened(false);
    PanelDragging(false);
    PanelSettling(false);
    panelGesture.current = null;
  }
  function desktopView(panel: "cards" | "plans") {
    if (panelTimer.current) clearTimeout(panelTimer.current);
    WorkspacePanel(panel);
    PanelDragging(false);
    PanelSettling(false);
    panelGesture.current = null;
    T(panel === "cards" ? "today" : "workspace");
  }
  function navigate(next: string) {
    if (!mobile && (next === "today" || next === "workspace")) {
      desktopView(next === "workspace" ? "plans" : "cards");
      return;
    }
    if (pageSlide.active) {
      if (slideTimer.current) clearTimeout(slideTimer.current);
      setPageSlide(idleSlide);
    }
    if (next === "workspace" && tab === "today") prepareWorkspace();
    else if (next === "workspace" && tab !== "workspace") PlansOpened(false);
    if (next === "workspace") WorkspaceVisited(true);
    T(next);
  }
  function workspaceDrag(distance: number) {
    slideDistance.current = Math.min(slideHeight.current, distance);
    if (pageSlide.active && !pageSlide.settling) {
      paintPageSlide("forward");
      return;
    }
    prepareWorkspace();
    if (slideTimer.current) clearTimeout(slideTimer.current);
    setPageSlide({
      active: true,
      settling: false,
      direction: "forward",
    });
  }
  function workspaceDrop(distance: number) {
    const commit = distance >= 80;
    slideDistance.current = commit ? slideHeight.current : 0;
    setPageSlide((v) =>
      v.active
        ? {
            ...v,
            settling: true,
          }
        : v,
    );
    if (slideTimer.current) clearTimeout(slideTimer.current);
    slideTimer.current = setTimeout(
      () => {
        if (commit) {
          WorkspaceVisited(true);
          T("workspace");
        }
        setPageSlide(idleSlide);
      },
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 360,
    );
  }
  useEffect(
    () => () => {
      if (slideTimer.current) clearTimeout(slideTimer.current);
    },
    [],
  );
  const backGesture = useRef<{
      pointer: number;
      x: number;
      y: number;
      dragging: boolean;
    } | null>(null),
    backSuppress = useRef(false);
  function scrollGesture(el: HTMLElement) {
    return (
      el.classList.contains("tasks") && collection === "favorites"
        ? "pan-y"
        : el.classList.contains("workspace-plans")
          ? el.querySelector(".plan-timeline")
            ? "pan-y"
            : "pan-x"
          : el.classList.contains("plan-goal-board")
            ? "none"
            : el.matches(".plan-card-library,.plan-card-categories")
              ? "pan-y"
              : el.scrollTop <= 1
                ? "pan-down"
                : "pan-y"
    );
  }
  function updateScrollGesture(el: HTMLElement) {
    const next = scrollGesture(el);
    if (el.style.touchAction !== next) el.style.touchAction = next;
  }
  useEffect(() => {
    if (!mobile || (tab !== "workspace" && !pageSlide.active)) return;
    const areas = workspaceScene.current?.querySelectorAll<HTMLElement>(
      ".workspace-scroll-area",
    );
    if (!areas) return;
    const measure = () => {
      // Read every scroll boundary before changing touch behavior. Alternating
      // these reads and writes forces layout for each area on older WebViews.
      const values = [...areas].map(el => [el, scrollGesture(el)] as const);
      for (const [el, next] of values)
        if (el.style.touchAction !== next) el.style.touchAction = next;
    };
    const observer = new ResizeObserver(measure);
    // observe() supplies the initial callback after layout and before paint.
    // Reading scrollTop here instead forces an extra full layout during commit.
    areas.forEach((el) => {
      observer.observe(el);
      if (el.firstElementChild) observer.observe(el.firstElementChild);
    });
    return () => {
      observer.disconnect();
      areas.forEach((el) => el.style.removeProperty("touch-action"));
    };
  }, [
    mobile,
    tab,
    workspacePanel,
    pageSlide.active,
    collection,
    s?.cards.length,
    s?.plans.length,
  ]);
  function backDown(e: PointerEvent<HTMLDivElement>) {
    if (
      !mobile ||
      tab !== "workspace" ||
      modal ||
      inspected ||
      pageSlide.active ||
      e.button !== 0 ||
      !e.isPrimary ||
      (e.target as HTMLElement).closest(
        "dialog,.category-wheel,input,select,textarea,.plan-source,.plan-selectors,.plan-goal-fields,.plan-board-controls",
      )
    )
      return;
    const area = (e.target as HTMLElement).closest<HTMLElement>(
        ".workspace-scroll-area",
      ),
      top = !area || area.scrollTop <= 1;
    if (
      !top ||
      area?.matches(".plan-card-library,.plan-card-categories,.plan-goal-board")
    )
      return;
    backSuppress.current = false;
    backGesture.current = {
      pointer: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      dragging: false,
    };
  }
  function backMove(e: PointerEvent<HTMLDivElement>) {
    const g = backGesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    if (e.buttons === 0) {
      backEnd(e, true);
      return;
    }
    const dy = e.clientY - g.y,
      dx = e.clientX - g.x;
    if (!g.dragging) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        backGesture.current = null;
        return;
      }
      if (dy < -10) {
        backGesture.current = null;
        return;
      }
      if (dy <= 10) return;
      g.dragging = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    backSuppress.current = true;
    e.preventDefault();
    slideDistance.current = Math.max(0, Math.min(slideHeight.current, dy));
    if (pageSlide.active) paintPageSlide("back");
    else setPageSlide({ active: true, settling: false, direction: "back" });
  }
  function backDrop(distance: number) {
    const commit = distance >= 80;
    slideDistance.current = commit ? slideHeight.current : 0;
    setPageSlide({
      active: true,
      settling: true,
      direction: "back",
    });
    if (slideTimer.current) clearTimeout(slideTimer.current);
    slideTimer.current = setTimeout(
      () => {
        if (commit) T("today");
        setPageSlide(idleSlide);
      },
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 360,
    );
  }
  function backEnd(e: PointerEvent<HTMLDivElement>, cancel = false) {
    const g = backGesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    backGesture.current = null;
    if (g.dragging) backDrop(cancel ? 0 : Math.max(0, e.clientY - g.y));
  }
  useEffect(() => {
    const stop = () => {
      if (backGesture.current?.dragging) backDrop(0);
      backGesture.current = null;
    };
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);
    return () => {
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stop);
    };
  }, []);
  useEffect(() => {
    const back = (e: Event) => {
      if (busy.current) {
        e.preventDefault();
        return;
      }
      if (tab !== "today") {
        e.preventDefault();
        if (slideTimer.current) clearTimeout(slideTimer.current);
        setPageSlide(idleSlide);
        if (mobile) T("today");
        else desktopView("cards");
      }
    };
    window.addEventListener("statify:navigate-back", back);
    return () => window.removeEventListener("statify:navigate-back", back);
  }, [tab, mobile]);
  return {
    workspacePanel,
    WorkspacePanel,
    plansOpened,
    workspaceVisited,
    planCardFilter,
    PlanCardFilter,
    panelTrack,
    panelDragging,
    PanelDragging,
    panelSettling,
    PanelSettling,
    workspaceScene,
    homeScene,
    switchWorkspace,
    panelDown,
    panelMove,
    panelEnd,
    pageSlide,
    desktopView,
    navigate,
    workspaceDrag,
    workspaceDrop,
    updateScrollGesture,
    backDown,
    backMove,
    backEnd,
    backSuppress,
  };
}
