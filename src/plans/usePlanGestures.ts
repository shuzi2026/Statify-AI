import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type MouseEvent,
} from "react";
import type { Card, Plan } from "../model";
export function usePlanGestures({
  p,
  desktop,
  choosing,
  configuring,
  add,
}: {
  p: Plan;
  desktop: boolean;
  readOnlyDemo: boolean;
  choosing: unknown;
  configuring: unknown;
  add: (c: Card, scheduled?: boolean, increment?: boolean) => Promise<void>;
}) {
  const [drag, Drag] = useState<{ card: Card } | null>(null);
  const dragElement = useRef<HTMLDivElement>(null),
    dragPosition = useRef<{ x: number; y: number } | null>(null),
    dragFrame = useRef<number | null>(null);
  function paintDrag() {
    const point = dragPosition.current,
      el = dragElement.current;
    if (point && el)
      el.style.transform = `translate3d(${point.x}px, ${point.y}px, 0) translate(-50%, -40%) rotate(-4deg)`;
  }
  function moveDrag(card: Card, x: number, y: number) {
    const starting = !dragPosition.current;
    dragPosition.current = { x, y };
    if (starting) Drag({ card });
    if (dragFrame.current === null)
      dragFrame.current = requestAnimationFrame(() => {
        dragFrame.current = null;
        paintDrag();
      });
  }
  function clearDrag() {
    if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
    dragFrame.current = null;
    dragPosition.current = null;
  }
  useLayoutEffect(() => {
    paintDrag();
  }, [drag]);
  const drop = useRef<HTMLElement>(null),
    timelineDrop = useRef<HTMLDivElement>(null),
    gesture = useRef<{
      pointer: number;
      card: Card;
      x: number;
      y: number;
      element: HTMLElement;
      moved: boolean;
      mode: "drag" | "scroll";
      top: number;
    } | null>(null),
    suppress = useRef(false),
    scrollGesture = useRef<{
      pointer: number;
      x: number;
      y: number;
      top: number;
      moved: boolean;
    } | null>(null),
    scrollSuppress = useRef(false);

  function down(e: PointerEvent<HTMLDivElement>, c: Card) {
    if (
      e.button !== 0 ||
      !e.isPrimary ||
      !(e.target as HTMLElement).closest(
        ".gallery-card-paper,.plan-drag-hint",
      ) ||
      (e.target as HTMLElement).closest(
        "input,select,.fan-card-corner,.card-delete-button,.card-edit-button,.plan-remove-cross,.plan-goal-fields,.plan-goal-remove,.plan-slot-heading,.plan-inspect-card",
      )
    )
      return;
    e.stopPropagation();
    suppress.current = false;
    const area = e.currentTarget.closest<HTMLElement>(
      ".plan-card-library,.plan-goal-board",
    )!;
    const handle = (e.target as HTMLElement).closest<HTMLElement>(
        ".gallery-card-paper,.plan-drag-hint",
      )!,
      bounds = handle.getBoundingClientRect(),
      onCard =
        e.clientX >= bounds.left &&
        e.clientX <= bounds.right &&
        e.clientY >= bounds.top &&
        e.clientY <= bounds.bottom;
    const g: NonNullable<typeof gesture.current> = {
      pointer: e.pointerId,
      card: c,
      x: e.clientX,
      y: e.clientY,
      element: area,
      moved: false,
      // Mobile browsers can retarget a touch in a narrow gap to a nearby
      // button. Preserve gap scrolling using the actual pointer position.
      mode: onCard ? "drag" : "scroll",
      top: area.scrollTop,
    };
    gesture.current = g;
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    e.stopPropagation();
    const dx = e.clientX - g.x,
      dy = e.clientY - g.y;
    if (g.mode === "scroll") {
      if (!g.moved && (Math.abs(dy) <= 8 || Math.abs(dx) > Math.abs(dy)))
        return;
      g.moved = true;
      suppress.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
      g.element.scrollTop = g.top - dy;
      return;
    }
    // Card surfaces drag immediately after tap slop; blank space scrolls via
    // the workspace's existing scroll gesture. No long-press timer competes.
    if (Math.hypot(dx, dy) > 6) {
      g.moved = true;
      suppress.current = true;
    }
    if (g.moved) {
      if (!e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
      moveDrag(g.card, e.clientX, e.clientY);
    }
  }
  function up(e: PointerEvent<HTMLDivElement>, cancel = false) {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    e.stopPropagation();
    gesture.current = null;
    clearDrag();
    Drag(null);
    if (cancel || !g.moved || g.mode === "scroll") return;
    const target = p.timeline ? timelineDrop.current : drop.current,
      b = target?.getBoundingClientRect();
    if (
      b &&
      e.clientX >= b.x &&
      e.clientX <= b.right &&
      e.clientY >= b.y &&
      e.clientY <= b.bottom
    )
      void add(g.card, !!p.timeline, !g.element.matches(".plan-goal-board"));
  }
  useEffect(() => {
    const stop = () => {
      gesture.current = null;
      scrollGesture.current = null;
      railPan.current = null;
      railClick.current = false;
      clearDrag();
      Drag(null);
    };
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);
    return () => {
      clearDrag();
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stop);
    };
  }, []);
  useEffect(() => {
    if (choosing || configuring) {
      suppress.current = false;
      scrollSuppress.current = false;
    }
  }, [choosing, configuring]);
  const railPan = useRef<{
      pointer: number;
      x: number;
      y: number;
      left: number;
      moved: boolean;
      index: number;
      stride: number;
    } | null>(null),
    railClick = useRef(false);
  function timelineDown(e: PointerEvent<HTMLElement>) {
    const rail = timelineDrop.current;
    railClick.current = false;
    if (desktop || !p.timeline || !rail || e.button !== 0 || !e.isPrimary)
      return;
    const inside = rail.contains(e.target as Node);
    if (
      !inside &&
      (e.target as HTMLElement).closest(
        "button,input,select,textarea,.plan-selectors,[role=separator]",
      )
    )
      return;
    if (inside) e.stopPropagation();
    const card = rail.querySelector<HTMLElement>(".plan-entry"),
      width = card?.getBoundingClientRect().width || 1;
    railPan.current = {
      pointer: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      left: rail.scrollLeft,
      moved: false,
      index: Math.round(rail.scrollLeft / width),
      stride: width,
    };
  }
  function timelineMove(e: PointerEvent<HTMLElement>) {
    const g = railPan.current,
      rail = timelineDrop.current;
    if (!g || !rail || g.pointer !== e.pointerId) return;
    const dx = e.clientX - g.x,
      dy = e.clientY - g.y;
    if (!g.moved) {
      if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) {
        railPan.current = null;
        return;
      }
      if (Math.abs(dx) < 6 || Math.abs(dx) <= Math.abs(dy)) return;
      g.moved = true;
    }
    e.stopPropagation();
    e.preventDefault();
    railClick.current = true;
    if (!e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.setPointerCapture(e.pointerId);
    rail.scrollLeft = g.left - dx;
    const next = Math.round(rail.scrollLeft / g.stride);
    if (next !== g.index) {
      g.index = next;
    }
  }
  function timelineEnd(e: PointerEvent<HTMLElement>) {
    const g = railPan.current;
    // Only the rail that accepted this pointer may consume its release.
    // Desktop presses bubble to the workspace and must release there too.
    if (!g || g.pointer !== e.pointerId) return;
    if (g.moved || timelineDrop.current?.contains(e.target as Node))
      e.stopPropagation();
    railPan.current = null;
  }
  function timelineClick(e: MouseEvent<HTMLElement>) {
    if (railClick.current) {
      railClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
  }

  return {
    drag,
    dragElement,
    drop,
    timelineDrop,
    gesture,
    suppress,
    scrollGesture,
    scrollSuppress,
    railPan,
    down,
    move,
    up,
    timelineDown,
    timelineMove,
    timelineEnd,
    timelineClick,
  };
}
export type PlanGestures = ReturnType<typeof usePlanGestures>;
