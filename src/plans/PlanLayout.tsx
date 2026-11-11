import { layoutMedia } from "../ui-layout/responsive";
import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  type RefObject,
} from "react";
import type { Plan } from "../model";
import { subscribeTheme } from "../themes/runtime";
import type { PlanBoard } from "./usePlanBoard";
import { writePlanLayout } from "../local-data/device-preferences";
import { readPreference, subscribePreferences } from "../local-data/preferences";
import { setLayoutStyle } from "../ui-layout/style-value";
export function usePlanDesktop() {
  const [desktop, Desktop] = useState(
    () => matchMedia(layoutMedia.desktop).matches,
  );
  useEffect(() => {
    const media = matchMedia(layoutMedia.desktop),
      update = () => Desktop(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return desktop;
}
export function usePlanLayout({
  p,
  viewKey,
  desktop,
  readOnlyDemo,
  drop,
}: {
  p: Plan;
  viewKey: string;
  desktop: boolean;
  readOnlyDemo: boolean;
  drop: RefObject<HTMLElement | null>;
}) {
  const layout = useRef<HTMLDivElement>(null),
    divider = useRef<HTMLDivElement>(null),
    resizing = useRef<{
      pointer: number;
      y: number;
      ratio: number;
      space: number;
    } | null>(null);
  const [initial] = useState(() => readPreference("planLayout"));
  const split = useRef(initial.value.ratio);
  const manualSplit = useRef(
    initial.status === "value" && initial.value.manual,
  );
  const splitPreview = useRef<number | null>(null),
    splitFrame = useRef(0),
    pendingSaves = useRef(0),
    latestSave = useRef(0),
    latestSaved = useRef(false);
  const heldSplit = useRef<{ width: number; height: number; viewKey: string } | null>(null);
  const holdSplitForTimeline = () => {
    const root = layout.current;
    if (root && !desktop && !manualSplit.current) {
      heldSplit.current = { width: root.clientWidth, height: root.clientHeight, viewKey };
    }
  };
  const paintRows = (ratio: number) => {
    const node = layout.current;
    if (!node || !divider.current || node.hasAttribute("data-guide-demo")) return;
    setLayoutStyle(
      node,
      "grid-template-rows",
      `minmax(0,${ratio}fr) auto minmax(0,${1 - ratio}fr)`,
    );
  };
  // Fitting the divider changes geometry, not the plan's rendered data.
  const applySplit = (ratio: number) => {
    split.current = ratio;
    paintRows(ratio);
    divider.current?.firstElementChild?.setAttribute(
      "aria-valuenow",
      String(Math.round(ratio * 100)),
    );
  };
  useLayoutEffect(() => {
    if (desktop) layout.current?.style.removeProperty("grid-template-rows");
    else applySplit(split.current);
  }, [desktop, readOnlyDemo]);
  const restoreSavedSplit = () => {
    const saved = readPreference("planLayout");
    if (!["value", "legacy-changed"].includes(saved.status) || resizing.current) return;
    manualSplit.current = saved.value.manual;
    applySplit(saved.value.ratio);
  };
  useEffect(() => {
    let previous = JSON.stringify(readPreference("planLayout").value);
    return subscribePreferences(() => {
      const saved = readPreference("planLayout"), next = JSON.stringify(saved.value);
      if (!["value", "legacy-changed"].includes(saved.status) || next === previous || resizing.current || pendingSaves.current) return;
      previous = next;
      manualSplit.current = saved.value.manual;
      applySplit(saved.value.ratio);
    });
  }, []);
  const saveSplit = async (value: { ratio: number; manual: boolean }) => {
    const request = ++latestSave.current;
    pendingSaves.current++;
    latestSaved.current = false;
    try {
      const result = await writePlanLayout(value);
      if (request === latestSave.current) latestSaved.current = result === "saved";
    } finally {
      pendingSaves.current--;
      // A previous commit must not replay its position over newer local input.
      // Once all writes settle, accept the actual saved winner (including other
      // tabs). A failed latest save keeps the user's local position for retry.
      if (!pendingSaves.current && latestSaved.current) restoreSavedSplit();
    }
  };
  const previewSplit = (n: number) => {
    splitPreview.current = Math.max(0.25, Math.min(0.75, n));
    if (!splitFrame.current)
      splitFrame.current = requestAnimationFrame(() => {
        splitFrame.current = 0;
        if (splitPreview.current !== null) paintRows(splitPreview.current);
      });
  };
  const finishSplit = () => {
    if (!resizing.current) return;
    resizing.current = null;
    cancelAnimationFrame(splitFrame.current);
    splitFrame.current = 0;
    if (splitPreview.current !== null) setSplit(splitPreview.current);
    splitPreview.current = null;
  };
  useEffect(() => () => cancelAnimationFrame(splitFrame.current), []);
  const setSplit = (n: number) => {
    manualSplit.current = true;
    const value = Math.max(0.25, Math.min(0.75, n));
    applySplit(value);
    void saveSplit({ ratio: value, manual: true });
  };

  useLayoutEffect(() => {
    if (readOnlyDemo || desktop) return;
    const root = layout.current,
      panel = drop.current;
    if (!root || !panel) return;
    let frame = 0;
    const fit = () => {
      frame = 0;
      const height = root.clientHeight;
      if (manualSplit.current || resizing.current || !height) return;
      const held = heldSplit.current;
      if (held?.viewKey === viewKey && held.height === height && held.width === root.clientWidth) return;
      heldSplit.current = null;
      const rail = panel.querySelector<HTMLElement>(":scope > .plan-rail"),
        entry = rail?.querySelector<HTMLElement>(".plan-entry");
      if (!rail) return;
      const style = getComputedStyle(rail),
        space =
          height -
          (divider.current?.getBoundingClientRect().height || 0),
        needed =
          panel.getBoundingClientRect().height -
          rail.getBoundingClientRect().height +
          (entry?.getBoundingClientRect().height || 80) +
          parseFloat(style.paddingTop) +
          parseFloat(style.paddingBottom) +
          8;
      if (space > 0) {
        const next = Math.max(0.25, Math.min(0.75, needed / space));
        if (Math.abs(split.current - next) > 0.002) applySplit(next);
      }
    };
    const schedule = () => {
        if (!frame) frame = requestAnimationFrame(fit);
      },
      observer = new ResizeObserver(schedule);
    observer.observe(root);
    for (const el of panel.querySelectorAll(
      ".plan-entry,.plan-selectors,.plan-progress-summary",
    ))
      observer.observe(el);
    const unsubscribe = subscribeTheme(() => {
      heldSplit.current = null;
      schedule();
    });
    schedule();
    return () => {
      observer.disconnect();
      unsubscribe();
      cancelAnimationFrame(frame);
    };
  }, [
    readOnlyDemo,
    desktop,
    p.timeline,
    viewKey,
    p.cards.length,
    p.slots?.length,
  ]);

  return {
    layout,
    divider,
    resizing,
    split,
    previewSplit,
    finishSplit,
    setSplit,
    holdSplitForTimeline,
  };
}
export function PlanDivider({
  desktop,
  state,
}: {
  desktop: boolean;
  state: ReturnType<typeof usePlanLayout>;
}) {
  const {
    layout,
    divider,
    resizing,
    split,
    previewSplit,
    finishSplit,
    setSplit,
  } = state;
  return (
    <>
      {!desktop && (
        <div
          ref={divider}
          className="plan-divider"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            className="plan-resize-handle"
            role="separator"
            aria-label="调整计划与卡牌区域高度"
            aria-orientation="horizontal"
            aria-valuemin={25}
            aria-valuemax={75}
            aria-valuenow={Math.round(split.current * 100)}
            tabIndex={0}
            onPointerDown={(e) => {
              if (e.button !== 0 || !e.isPrimary) return;
              e.stopPropagation();
              e.preventDefault();
              const space = layout.current?.clientHeight || 0;
              if (space <= 0) return;
              resizing.current = {
                pointer: e.pointerId,
                y: e.clientY,
                ratio: split.current,
                space,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const g = resizing.current;
              if (!g || g.pointer !== e.pointerId) return;
              e.stopPropagation();
              e.preventDefault();
              previewSplit(g.ratio + (e.clientY - g.y) / g.space);
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              finishSplit();
            }}
            onPointerCancel={finishSplit}
            onLostPointerCapture={finishSplit}
            onKeyDown={(e) => {
              if (["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                e.stopPropagation();
                setSplit(
                  e.key === "Home"
                    ? 0.25
                    : e.key === "End"
                      ? 0.75
                      : split.current + (e.key === "ArrowDown" ? 0.03 : -0.03),
                );
              }
            }}
          >
            <span />
          </div>
        </div>
      )}
    </>
  );
}
export function usePlanArrival({
  arrival,
  Arrive,
  p,
  desktop,
  layout,
}: Pick<PlanBoard, "arrival" | "Arrive" | "p"> & {
  desktop: boolean;
  layout: RefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    if (!arrival || arrival.planId !== p.id) return;
    const el = layout.current?.querySelector<HTMLElement>(
      '[data-plan-focus="' + arrival.key + '"]',
    );
    if (!el) {
      Arrive(null);
      return;
    }
    const rail = el.closest<HTMLElement>(".plan-rail");
    let frame = requestAnimationFrame(() => {
      const cardEl = el.querySelector<HTMLElement>(".gallery-card-paper");
      for (const animation of cardEl &&
      typeof cardEl.getAnimations === "function"
        ? cardEl.getAnimations()
        : [])
        if (
          typeof CSSAnimation !== "undefined" &&
          animation instanceof CSSAnimation &&
          animation.animationName === "plan-arrival"
        ) {
          animation.currentTime = 0;
          animation.play();
        }
      if (rail) {
        const b = el.getBoundingClientRect(),
          r = rail.getBoundingClientRect(),
          behavior = matchMedia("(prefers-reduced-motion:reduce)").matches
            ? "instant"
            : "smooth";
        if (rail.classList.contains("plan-timeline") && !desktop)
          rail.scrollTo({
            left:
              rail.scrollLeft + b.x - r.x - (rail.clientWidth - b.width) / 2,
            behavior,
          });
        else
          rail.scrollTo({
            top:
              rail.scrollTop + b.y - r.y - (rail.clientHeight - b.height) / 2,
            behavior,
          });
      }
    });
    const timer = setTimeout(() => Arrive(null), 1700);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [arrival, p.id, p.cards.length, p.slots?.length]);
}
