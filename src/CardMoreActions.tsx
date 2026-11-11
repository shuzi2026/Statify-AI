import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";

/** Temporary actions float beside the dots; they never change the card grid. */
export function CardMoreActions({
  name,
  archive,
  reorder,
}: {
  name: string;
  archive: () => void;
  reorder?: () => void;
}) {
  const [open, Open] = useState(false),
    [position, Position] = useState<CSSProperties>(),
    id = useId();
  const trigger = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null);
  const close = (restore = false) => {
    Open(false);
    if (restore) trigger.current?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      if (!trigger.current || !panel.current) return;
      const b = trigger.current.getBoundingClientRect(),
        p = panel.current.getBoundingClientRect(),
        v = window.visualViewport;
      const left = v?.offsetLeft || 0,
        top = v?.offsetTop || 0,
        width = v?.width || innerWidth,
        height = v?.height || innerHeight,
        gap = 6,
        margin = 8;
      if (b.bottom < top || b.top > top + height) {
        Open(false);
        return;
      }
      // Prefer the right side. At the edge move inward without covering the dots.
      const x =
        b.right + gap + p.width <= left + width - margin
          ? b.right + gap
          : b.left - gap - p.width;
      Position({
        left: Math.max(
          left + margin,
          Math.min(x, left + width - margin - p.width),
        ),
        top: Math.max(
          top + margin,
          Math.min(
            b.top + (b.height - p.height) / 2,
            top + height - margin - p.height,
          ),
        ),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (panel.current) observer.observe(panel.current);
    if (trigger.current) observer.observe(trigger.current);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      const target = e.target as Node;
      if (
        !trigger.current?.contains(target) &&
        !panel.current?.contains(target)
      )
        close();
    };
    const escape = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close(true);
      }
    };
    const blur = () => close();
    const frame = requestAnimationFrame(() =>
      panel.current
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus({ preventScroll: true }),
    );
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("blur", blur);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", blur);
    };
  }, [open]);
  function keys(e: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const buttons = Array.from(
        panel.current?.querySelectorAll<HTMLButtonElement>("button") || [],
      ),
      at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? buttons.length - 1
          : Math.max(
              0,
              Math.min(
                buttons.length - 1,
                at + (e.key === "ArrowDown" ? 1 : -1),
              ),
            );
    e.preventDefault();
    buttons[next]?.focus({ preventScroll: true });
  }
  return (
    <div className="card-more">
      <button
        ref={trigger}
        type="button"
        className="card-more-trigger"
        aria-label={"更多卡牌操作 " + name}
        aria-haspopup="menu"
        aria-controls={open ? id : undefined}
        aria-expanded={open}
        onClick={() => Open((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            Open(true);
          }
        }}
      >
        <MoreVertical size={16} />
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            className="card-more-bubbles"
            role="menu"
            aria-label={name + "更多操作"}
            style={position || { visibility: "hidden" }}
            onKeyDown={keys}
            data-gesture-ignore
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close(true);
                archive();
              }}
            >
              归档
            </button>
            {reorder && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close(true);
                  reorder();
                }}
              >
                调整顺序
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
