import { useEffect, useRef, useState, type PointerEvent } from "react";

export function CategoryWheel({
  categories,
  selected,
  onSelect,
  label = "卡牌分类滑轮",
}: {
  categories: string[];
  selected: string;
  onSelect: (category: string) => void;
  label?: string;
}) {
  const index = Math.max(0, categories.indexOf(selected)),
    [shift, Shift] = useState(0),
    [open, Open] = useState(false),
    root = useRef<HTMLDivElement>(null),
    drag = useRef<{
      pointer: number;
      x: number;
      y: number;
      angle: number;
      index: number;
      startedOpen: boolean;
      moved: boolean;
      closing: boolean;
    } | null>(null),
    suppress = useRef(false);
  function angle(e: PointerEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return (
      (Math.atan2(e.clientY - r.bottom, e.clientX - r.right) * 180) / Math.PI
    );
  }
  function down(e: PointerEvent<HTMLElement>) {
    if (e.button !== 0 || !e.isPrimary) return;
    e.stopPropagation();
    suppress.current = false;
    drag.current = {
      pointer: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      angle: angle(e),
      index,
      startedOpen: open,
      moved: false,
      closing: false,
    };
  }
  function move(e: PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    e.stopPropagation();
    const dx = e.clientX - d.x,
      dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) > 8) {
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
    if (!d.startedOpen) {
      if (dx < -12 || dy < -12) {
        Open(true);
        d.startedOpen = true;
        d.angle = angle(e);
        d.index = index;
        d.x = e.clientX;
        d.y = e.clientY;
      }
      return;
    }
    if ((dx > 45 && dy > 20) || (dy > 60 && dx >= 0)) {
      d.closing = true;
      return;
    }
    const delta = ((angle(e) - d.angle + 540) % 360) - 180;
    Shift(Math.max(-30, Math.min(30, delta)));
    if (d.moved)
      onSelect(
        categories[
          Math.max(
            0,
            Math.min(categories.length - 1, d.index + Math.round(delta / 24)),
          )
        ],
      );
  }
  function end(e: PointerEvent<HTMLElement>, cancel = false) {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    e.stopPropagation();
    suppress.current = d.moved;
    drag.current = null;
    Shift(0);
    if (cancel || d.closing) Open(false);
  }
  useEffect(() => {
    if (!open) return;
    const outside = (e: globalThis.PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) Open(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const start = Math.max(0, Math.min(categories.length - 5, index - 2)),
    visible = categories.slice(start, start + 5);
  return (
    <div
      ref={root}
      className={"category-wheel " + (open ? "is-open" : "is-closed")}
      role="group"
      aria-label={label}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={(e) => end(e)}
      onPointerCancel={(e) => end(e, true)}
      onLostPointerCapture={(e) => {
        if (e.target === e.currentTarget) end(e, true);
      }}
      onClickCapture={(e) => {
        if (suppress.current && e.detail !== 0) {
          suppress.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {open && (
        <>
          <div
            className="wheel-track"
            aria-hidden="true"
            style={{ transform: `rotate(${shift * 0.3}deg)` }}
          />
          {visible.map((name, slot) => {
            const a = ((190 + slot * 18 + shift * 0.3) * Math.PI) / 180;
            return (
              <button
                key={name}
                title={name}
                className={selected === name ? "selected" : ""}
                aria-pressed={selected === name}
                style={{
                  left: 216 + 172 * Math.cos(a),
                  top: 216 + 172 * Math.sin(a),
                }}
                onClick={() => {
                  onSelect(name);
                  Open(false);
                }}
                onKeyDown={(e) => {
                  const i = categories.indexOf(name);
                  if (e.key === "ArrowUp" || e.key === "ArrowRight") {
                    e.preventDefault();
                    onSelect(
                      categories[Math.min(categories.length - 1, i + 1)],
                    );
                  }
                  if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
                    e.preventDefault();
                    onSelect(categories[Math.max(0, i - 1)]);
                  }
                  if (e.key === "Escape") Open(false);
                }}
              >
                {name}
              </button>
            );
          })}
        </>
      )}
      <button
        className="wheel-hub"
        aria-label={open ? "收起分类滑轮" : "展开分类滑轮"}
        aria-expanded={open}
        onClick={() => Open((v) => !v)}
      >
        <span className="wheel-triangle" aria-hidden="true" />
      </button>
    </div>
  );
}
