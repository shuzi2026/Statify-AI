import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { homeGeometry } from "../ui-layout/homeGeometry";
import type { MobileHomeProps, HomeViewport } from "./types";
export function useHomeHand(
  p: MobileHomeProps,
  windowSize: HomeViewport,
  attributeCount: number,
) {
  const { s, cards } = p;
  const [handEngaged, setHandEngaged] = useState(false);
  const [savedAttributeMode, setAttributeMode] = useState(0),
    [savedExpanded, setExpanded] = useState(
      () => window.innerHeight / window.innerWidth > 1.9,
    ),
    [activeId, setActiveId] = useState(
      cards[Math.min(1, cards.length - 1)]?.id,
    ),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [dragY, setDragY] = useState(0),
    [dragging, setDragging] = useState(false),
    [dragCard, setDragCard] = useState<string | null>(null),
    [handWidth, setHandWidth] = useState(390);
  const expanded = p.tourScene
      ? p.tourScene === "hand"
      : savedExpanded && cards.length > 0,
    attributeMode = p.tourScene ? 0 : savedAttributeMode;
  const handRef = useRef<HTMLDivElement>(null),
    dragFrame = useRef(0),
    pendingDrag = useRef({ x: 0, y: 0 }),
    flight = useRef<HTMLElement | null>(null),
    suppressClick = useRef(false),
    gesture = useRef<{
      x: number;
      y: number;
      cardId?: string;
      zone: "handle" | "card" | "hand" | "screen";
      axis: "x" | "y" | null;
      pointer: number;
    } | null>(null);

  const index = Math.max(
      0,
      cards.findIndex((c) => c.id === activeId),
    ),
    selected = s.cards.find((c) => c.id === selectedId);

  const geometry = homeGeometry(
    windowSize.width,
    windowSize.height,
    expanded,
    p.pending.some((a) => a.id !== p.timer?.id),
    windowSize.fontScale,
    attributeCount,
  );

  useEffect(() => {
    if (p.reminderCardId) setActiveId(p.reminderCardId);
  }, [p.reminderCardId]);
  useEffect(() => {
    if (selectedId && !s.cards.some((c) => c.id === selectedId))
      setSelectedId(null);
  }, [s.cards, selectedId]);
  useEffect(() => {
    const el = handRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHandWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!cards.some((c) => c.id === activeId))
      setActiveId(cards[Math.min(1, cards.length - 1)]?.id);
  }, [cards, activeId]);
  const choose = (n: number, focus = false) => {
    const c = cards[Math.max(0, Math.min(cards.length - 1, n))];
    if (c) {
      setActiveId(c.id);
      if (focus)
        requestAnimationFrame(() =>
          Array.from(
            handRef.current?.querySelectorAll<HTMLButtonElement>(
              "[data-card-id]",
            ) || [],
          )
            .find((b) => b.dataset.cardId === c.id)
            ?.focus({ preventScroll: true }),
        );
    }
  };
  const step = () => geometry.values.cardWidth * 0.79;
  // Horizontal input only moves already mounted cards. Keep the character,
  // status calculations and card contents out of the per-frame React path.
  function paintHorizontal(x: number | null) {
    for (const el of handRef.current?.querySelectorAll<HTMLElement>(
      "[data-card-id]",
    ) || []) {
      const base = Number(el.style.getPropertyValue("--offset"));
      const offset = base + (x === null ? 0 : x / step());
      const distance = Math.abs(offset);
      const hidden = distance > (handWidth >= 440 ? 3.6 : 2.6);
      if (x === null) el.style.removeProperty("transform");
      else
        el.style.transform = `translate3d(${offset * step()}px,${distance * geometry.values.cardHeight * 0.035}px,0) rotate(${offset * 3}deg) scale(${1 - distance * 0.035})`;
      el.style.zIndex = String(30 - Math.round(distance * 10));
      el.style.visibility = hidden ? "hidden" : "visible";
      el.classList.toggle("is-front", distance < 0.5);
      if (hidden) el.setAttribute("aria-hidden", "true");
      else el.removeAttribute("aria-hidden");
      const finish = el.querySelector<HTMLElement>(".hand-plan-finish");
      if (x === null) finish?.style.removeProperty("--offset");
      else finish?.style.setProperty("--offset", String(offset));
    }
  }
  useLayoutEffect(() => {
    // A clock/theme render during a held gesture must keep the current input.
    const g = gesture.current;
    if (g?.axis === "x" && expanded && (g.zone === "card" || g.zone === "hand"))
      paintHorizontal(pendingDrag.current.x);
  });
  function draw(id: string) {
    const el = Array.from(
      handRef.current?.querySelectorAll<HTMLElement>("[data-card-id]") || [],
    ).find((c) => c.dataset.cardId === id);
    if (el) {
      const box = el.getBoundingClientRect(),
        clone = el.cloneNode(true) as HTMLElement,
        style = getComputedStyle(el);
      clone.setAttribute("aria-hidden", "true");
      clone.tabIndex = -1;
      clone.className = "fan-card card-flight";
      Object.assign(clone.style, {
        position: "fixed",
        left: box.x + "px",
        top: box.y + "px",
        width: box.width + "px",
        height: box.height + "px",
        minHeight: "0",
        margin: "0",
        transform: "none",
        visibility: "visible",
        zIndex: "1000",
        background: style.background,
        color: style.color,
        boxShadow: style.boxShadow,
        pointerEvents: "none",
      });
      clone.style.setProperty("--offset", "0");
      clone.style.setProperty("--distance", "0");
      flight.current = clone;
    }
    setActiveId(id);
    setSelectedId(id);
  }
  function down(e: PointerEvent<HTMLElement>) {
    if (e.button !== 0 || !e.isPrimary || gesture.current || selectedId) return;
    const target = e.target as HTMLElement;
    if (
      target.closest(
        "input,select,textarea,[data-gesture-ignore],.floating-attributes",
      )
    ) {
      suppressClick.current = false;
      return;
    }
    const cardId =
      target.closest<HTMLElement>("[data-card-id]")?.dataset.cardId;
    const zone = target.closest(".card-manager-handle")
      ? "handle"
      : expanded && cardId
        ? "card"
        : target.closest(".fan-hand")
          ? "hand"
          : "screen";
    if (
      zone === "screen" &&
      getComputedStyle(e.currentTarget)
        .getPropertyValue("--layout-scroll-home")
        .trim() === "1"
    )
      return;
    setHandEngaged(zone === "card" || zone === "hand");
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      cardId,
      zone,
      axis: null,
      pointer: e.pointerId,
    };
    suppressClick.current = false;
  }
  function move(e: PointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    const dx = e.clientX - g.x,
      dy = e.clientY - g.y;
    const handPan = expanded && (g.zone === "card" || g.zone === "hand");
    const horizontal = handPan && Math.abs(dx) > Math.abs(dy);
    if (
      !g.axis &&
      Math.max(Math.abs(dx), Math.abs(dy)) > (horizontal ? 4 : 10)
    ) {
      g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (!(e.target as HTMLElement).closest(".quiet-orb"))
        e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
      if (g.zone === "card" && g.axis === "y" && dy < 0)
        setDragCard(g.cardId || null);
    }
    if (!g.axis) return;
    suppressClick.current = true;
    if (g.zone === "handle" && g.axis === "y" && expanded)
      p.workspaceDrag(Math.max(0, -dy));
    pendingDrag.current =
      g.axis === "x" && expanded && (g.zone === "card" || g.zone === "hand")
        ? {
            x: Math.max(
              -(cards.length - 1 - index) * step(),
              Math.min(index * step(), dx),
            ),
            y: 0,
          }
        : g.axis === "y" && g.zone === "card" && dy < 0
          ? { x: 0, y: dy }
          : g.axis === "y" && g.zone !== "handle"
            ? {
                x: 0,
                y: expanded
                  ? Math.max(0, Math.min(136, dy))
                  : Math.max(-136, Math.min(0, dy)),
              }
            : { x: 0, y: 0 };
    if (!dragFrame.current)
      dragFrame.current = requestAnimationFrame(() => {
        dragFrame.current = 0;
        if (g.axis === "x" && handPan) paintHorizontal(pendingDrag.current.x);
        else setDragY(pendingDrag.current.y);
      });
  }
  function cancel(pageDrop = true) {
    if (pageDrop && gesture.current?.zone === "handle") p.workspaceDrop(0);
    if (gesture.current?.axis === "x") paintHorizontal(null);
    gesture.current = null;
    cancelAnimationFrame(dragFrame.current);
    dragFrame.current = 0;
    pendingDrag.current = { x: 0, y: 0 };
    setHandEngaged(false);
    setDragging(false);
    setDragCard(null);
    setDragY(0);
  }
  function up(e: PointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    const dx = e.clientX - g.x,
      dy = e.clientY - g.y;
    if (g.zone === "handle" && g.axis === "y" && expanded) {
      p.workspaceDrop(Math.max(0, -dy));
      cancel(false);
      return;
    }
    if (g.axis === "y" && dy < -40 && g.zone === "card" && g.cardId)
      draw(g.cardId);
    else if (g.axis === "y" && dy < -40) {
      if (g.zone === "handle" && expanded) p.openWorkspace();
      else setExpanded(true);
    } else if (g.axis === "y" && dy > 40) setExpanded(false);
    else if (g.axis === "x" && Math.abs(dx) > 35) {
      if (expanded && (g.zone === "card" || g.zone === "hand"))
        choose(
          index - Math.sign(dx) * Math.round(Math.abs(dx) / step()),
        );
      else
        setAttributeMode((v) =>
          Math.max(0, Math.min(2, v + (dx < 0 ? 1 : -1))),
        );
    } else if (!g.axis && g.cardId && !expanded) {
      setExpanded(true);
      suppressClick.current = true;
    }
    cancel();
  }
  useEffect(() => {
    const stop = () => {
      suppressClick.current = true;
      cancel();
    };
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);
    return () => {
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stop);
      cancelAnimationFrame(dragFrame.current);
    };
  }, []);
  const closeCard = () => {
    setSelectedId(null);
    setExpanded(true);
  };

  return {
    expanded,
    attributeMode,
    setAttributeMode,
    selectedId,
    setSelectedId,
    selected,
    handRef,
    flight,
    suppressClick,
    gesture,
    geometry,
    handEngaged,
    dragging,
    dragCard,
    dragY,
    handWidth,
    index,
    choose,
    step,
    draw,
    down,
    move,
    up,
    cancel,
    closeCard,
    setExpanded,
  };
}
