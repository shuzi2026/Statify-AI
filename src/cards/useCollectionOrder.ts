import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { insertBefore } from "../card-collection";
import type { Card } from "../model";
type Slot = {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
};
type Press = {
  id: string;
  pointer: number;
  touch: boolean;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  before: string | null;
  allowed: boolean;
  slots: Slot[];
  scroll: HTMLElement;
  scrollStart: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

export type CardCollectionProps = {
  cards: Card[];
  sortable: boolean;
  render: (card: Card, position?: () => void) => ReactNode;
  reorder: (id: string, before: string | null) => Promise<boolean>;
};
export function useCollectionOrder({
  cards,
  sortable,
  reorder,
}: Pick<CardCollectionProps, "cards" | "sortable" | "reorder">) {
  const root = useRef<HTMLDivElement>(null),
    ghost = useRef<HTMLDivElement>(null),
    press = useRef<Press | null>(null),
    hold = useRef<ReturnType<typeof setTimeout> | null>(null),
    frame = useRef(0),
    suppress = useRef(false),
    busy = useRef(false);
  const [drag, Drag] = useState<{
      id: string;
      before: string | null;
      allowed: boolean;
      width: number;
      height: number;
      x: number;
      y: number;
    } | null>(null),
    [position, Position] = useState<string | null>(null),
    [pendingOrder, PendingOrder] = useState<string[] | null>(null),
    [saving, Saving] = useState(false),
    [message, Message] = useState("");
  const ids = cards.map((c) => c.id).join("|");
  function clear() {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
    const p = press.current;
    press.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    Drag(null);
    if (p && !p.touch && root.current?.hasPointerCapture(p.pointer))
      root.current.releasePointerCapture(p.pointer);
  }
  async function save(id: string, before: string | null) {
    if (busy.current) return;
    const next = insertBefore(cards, id, before);
    if (next.every((c, i) => c.id === cards[i].id)) {
      Position(null);
      return;
    }
    busy.current = true;
    Saving(true);
    PendingOrder(next.map((c) => c.id));
    Message("正在保存常用顺序…");
    try {
      if (await reorder(id, before)) {
        Message(
          `已将${cards.find((c) => c.id === id)?.name || "卡牌"}放到第${next.findIndex((c) => c.id === id) + 1}位。`,
        );
        Position(null);
      } else Message("顺序未保存，请重试。");
    } finally {
      busy.current = false;
      Saving(false);
      PendingOrder(null);
    }
  }
  function target(p: Press) {
    const area = p.scroll.getBoundingClientRect(),
      shift = p.scroll.scrollTop - p.scrollStart;
    p.allowed =
      p.x >= area.left &&
      p.x <= area.right &&
      p.y >= area.top &&
      p.y <= area.bottom;
    if (!p.allowed) return;
    const slots = p.slots.map((slot) => ({
      ...slot,
      top: slot.top - shift,
      bottom: slot.bottom - shift,
    }));
    // Choose a row first, then an insertion gap. Measurements remain stable while
    // the live placeholder moves, avoiding a target that chases its own reflow.
    const closest = slots.reduce((best, slot) =>
      Math.abs((slot.top + slot.bottom) / 2 - p.y) <
      Math.abs((best.top + best.bottom) / 2 - p.y)
        ? slot
        : best,
    );
    const row = slots.filter((slot) => Math.abs(slot.top - closest.top) < 4);
    let index = slots.indexOf(
      row.find((slot) => p.x < (slot.left + slot.right) / 2) ||
        row[row.length - 1],
    );
    if (p.x >= (row[row.length - 1].left + row[row.length - 1].right) / 2)
      index++;
    const source = slots.findIndex((slot) => slot.id === p.id);
    if (index > source) index--;
    const others = slots.filter((slot) => slot.id !== p.id);
    p.before = others[index]?.id || null;
  }
  function tick() {
    const p = press.current;
    if (!p?.active) return;
    const area = p.scroll.getBoundingClientRect(),
      edge = Math.min(64, area.height * 0.14);
    if (p.x >= area.left && p.x <= area.right) {
      const speed =
        p.y < area.top + edge
          ? -12 * Math.max(0, (area.top + edge - p.y) / edge)
          : p.y > area.bottom - edge
            ? 12 * Math.max(0, (p.y - area.bottom + edge) / edge)
            : 0;
      p.scroll.scrollTop += Math.max(-18, Math.min(18, speed));
    }
    target(p);
    if (ghost.current)
      ghost.current.style.transform = `translate3d(${p.x - p.offsetX}px,${p.y - p.offsetY}px,0)`;
    Drag((old) =>
      old && (old.before !== p.before || old.allowed !== p.allowed)
        ? { ...old, before: p.before, allowed: p.allowed }
        : old,
    );
    frame.current = requestAnimationFrame(tick);
  }
  function activate() {
    const p = press.current;
    if (!p || p.active || !root.current) return;
    p.active = true;
    suppress.current = true;
    if (!p.touch) root.current.setPointerCapture(p.pointer);
    target(p);
    Drag({
      id: p.id,
      before: p.before,
      allowed: p.allowed,
      width: p.width,
      height: p.height,
      x: p.x - p.offsetX,
      y: p.y - p.offsetY,
    });
    Message("正在移动卡牌，松开放置。");
    frame.current = requestAnimationFrame(tick);
  }
  function beginPress(
    paper: HTMLElement,
    item: HTMLElement,
    x: number,
    y: number,
    pointer: number,
    touch: boolean,
  ) {
    clear();
    suppress.current = false;
    const scroll = root.current!.closest<HTMLElement>(
        ".workspace-scroll-area",
      )!,
      b = paper.getBoundingClientRect();
    const slots = [
      ...root.current!.querySelectorAll<HTMLElement>("[data-collection-card]"),
    ].map((node) => {
      const r = node.getBoundingClientRect();
      return {
        id: node.dataset.collectionCard!,
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
      };
    });
    press.current = {
      id: item.dataset.collectionCard!,
      pointer,
      touch,
      startX: x,
      startY: y,
      x,
      y,
      active: false,
      before: null,
      allowed: false,
      slots,
      scroll,
      scrollStart: scroll.scrollTop,
      offsetX: x - b.left,
      offsetY: y - b.top,
      width: b.width,
      height: b.height,
    };
    if (touch) hold.current = setTimeout(activate, 340);
  }
  function down(e: PointerEvent<HTMLDivElement>) {
    if (!press.current) suppress.current = false;
    if (!sortable || busy.current || e.button !== 0 || !e.isPrimary) return;
    const paper = (e.target as HTMLElement).closest<HTMLElement>(
        ".gallery-card-paper",
      ),
      item = paper?.closest<HTMLElement>("[data-collection-card]");
    if (!paper || !item) return;
    e.stopPropagation();
    // Touch has its own stream: browsers can cancel Pointer Events before the
    // first touchmove. Canceling that pointer must not destroy a held touch drag.
    if (e.pointerType === "touch") return;
    beginPress(paper, item, e.clientX, e.clientY, e.pointerId, false);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const p = press.current;
    if (!p || p.touch || p.pointer !== e.pointerId) return;
    e.stopPropagation();
    p.x = e.clientX;
    p.y = e.clientY;
    if (!p.active && Math.hypot(p.x - p.startX, p.y - p.startY) > 7) {
      if (p.touch) {
        clear();
        return;
      }
      activate();
    }
    if (p.active) e.preventDefault();
  }
  function end(e: PointerEvent<HTMLDivElement>, cancel = false) {
    const p = press.current;
    if (!p || p.touch || p.pointer !== e.pointerId) return;
    e.stopPropagation();
    p.x = e.clientX;
    p.y = e.clientY;
    const active = p.active;
    if (active) {
      target(p);
      e.preventDefault();
    }
    const before = p.before,
      allowed = p.allowed;
    clear();
    if (active && !cancel && allowed) void save(p.id, before);
    else if (active) Message("已取消移动。");
  }
  useEffect(() => {
    const el = root.current;
    if (!el || !sortable) return;
    // Keep native pan/zoom until a stationary long press activates. Register the
    // non-passive listener in advance, so the first move can cancel default pan.
    const touchStart = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        clear();
        return;
      }
      if (!sortable || busy.current) return;
      const paper = (e.target as HTMLElement).closest<HTMLElement>(
          ".gallery-card-paper",
        ),
        item = paper?.closest<HTMLElement>("[data-collection-card]"),
        t = e.touches[0];
      if (paper && item && t)
        beginPress(paper, item, t.clientX, t.clientY, t.identifier, true);
    };
    const touchMove = (e: TouchEvent) => {
      const p = press.current;
      if (!p?.touch) return;
      const t = [...e.touches].find((t) => t.identifier === p.pointer);
      if (!t) return;
      p.x = t.clientX;
      p.y = t.clientY;
      if (p.active) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
      } else if (Math.hypot(p.x - p.startX, p.y - p.startY) > 7) clear();
    };
    const touchEnd = (e: TouchEvent) => {
      const p = press.current;
      if (!p?.touch) return;
      if (e.type === "touchcancel") {
        clear();
        if (p.active) Message("已取消移动。");
        return;
      }
      const t = [...e.changedTouches].find((t) => t.identifier === p.pointer);
      if (!t) return;
      p.x = t.clientX;
      p.y = t.clientY;
      const active = p.active;
      if (active) {
        target(p);
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
      }
      const before = p.before,
        allowed = p.allowed;
      clear();
      if (active && e.type !== "touchcancel" && allowed)
        void save(p.id, before);
      else if (active) Message("已取消移动。");
    };
    const stop = () => {
        const active = press.current?.active;
        clear();
        if (active) Message("已取消移动。");
      },
      escape = (e: KeyboardEvent) => {
        if (e.key === "Escape" && press.current?.active) {
          e.preventDefault();
          e.stopPropagation();
          clear();
          Message("已取消移动。");
        }
      };
    el.addEventListener("touchmove", touchMove, { passive: false });
    el.addEventListener("touchstart", touchStart, { passive: true });
    el.addEventListener("touchend", touchEnd, { passive: false });
    el.addEventListener("touchcancel", touchEnd, { passive: false });
    window.addEventListener("blur", stop);
    window.addEventListener("resize", stop);
    document.addEventListener("visibilitychange", stop);
    document.addEventListener("keydown", escape, true);
    return () => {
      clear();
      el.removeEventListener("touchmove", touchMove);
      el.removeEventListener("touchstart", touchStart);
      el.removeEventListener("touchend", touchEnd);
      el.removeEventListener("touchcancel", touchEnd);
      window.removeEventListener("blur", stop);
      window.removeEventListener("resize", stop);
      document.removeEventListener("visibilitychange", stop);
      document.removeEventListener("keydown", escape, true);
    };
  }, [ids, sortable]);
  const shown = drag?.allowed
      ? insertBefore(cards, drag.id, drag.before)
      : sortable && pendingOrder
        ? [...cards].sort(
            (a, b) => pendingOrder.indexOf(a.id) - pendingOrder.indexOf(b.id),
          )
        : cards,
    dragged = cards.find((c) => c.id === drag?.id),
    named = cards.find((c) => c.id === position);

  return {
    root,
    ghost,
    press,
    suppress,
    drag,
    position,
    Position,
    saving,
    message,
    shown,
    dragged,
    named,
    save,
    down,
    move,
    end,
  };
}
