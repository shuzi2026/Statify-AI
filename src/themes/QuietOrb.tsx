import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type PointerEvent,
} from "react";
import { subscribeTheme, themeSnapshot } from "./runtime";
import { ThemeArtwork } from "./ThemeArtwork";
import { animateSafely } from "../ui-layout/animation";
export function QuietOrb() {
  const theme = useSyncExternalStore(subscribeTheme, themeSnapshot),
    draggable = theme.companionDraggable !== false;
  const ref = useRef<HTMLDivElement>(null),
    frame = useRef(0),
    animation = useRef<Animation | null>(null),
    drag = useRef<{
      pointer: number;
      x: number;
      y: number;
      offsetX: number;
      offsetY: number;
    } | null>(null),
    position = useRef({ x: 0, y: 0 });
  function settle() {
    drag.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    const el = ref.current;
    if (!el) return;
    el.classList.remove("is-dragging");
    const { x, y } = position.current;
    position.current = { x: 0, y: 0 };
    el.style.transform = "translate3d(0,0,0)";
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      animation.current?.cancel();
      animation.current = animateSafely(
        el,
        Array.from({ length: 33 }, (_, i) => {
          const t = i / 32,
            k = i === 32 ? 0 : Math.exp(-7 * t) * Math.cos(10 * t);
          return { transform: `translate3d(${x * k}px,${y * k}px,0)` };
        }),
        { duration: 520, easing: "linear" },
      );
    }
  }
  function down(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !e.isPrimary || drag.current) return;
    const el = e.currentTarget;
    const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    animation.current?.cancel();
    position.current = { x: matrix.m41, y: matrix.m42 };
    drag.current = {
      pointer: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      offsetX: matrix.m41,
      offsetY: matrix.m42,
    };
    el.classList.add("is-dragging");
    el.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    position.current = {
      x: d.offsetX + 64 * Math.tanh((e.clientX - d.x) / 100),
      y: d.offsetY + 64 * Math.tanh((e.clientY - d.y) / 100),
    };
    if (!frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        const el = ref.current;
        if (el) {
          const { x, y } = position.current;
          el.style.transform = `translate3d(${x}px,${y}px,0)`;
        }
      });
  }
  function end(e: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointer === e.pointerId) settle();
  }
  useEffect(() => {
    const stop = () => {
      if (drag.current) settle();
    };
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);
    return () => {
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stop);
      cancelAnimationFrame(frame.current);
      animation.current?.cancel();
    };
  }, []);
  useEffect(() => {
    if (!draggable) {
      animation.current?.cancel();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      drag.current = null;
      position.current = { x: 0, y: 0 };
      ref.current?.style.removeProperty("transform");
      ref.current?.classList.remove("is-dragging");
    }
  }, [draggable]);
  return (
    <div
      ref={ref}
      className="quiet-orb"
      role="img"
      aria-label={draggable ? "可拖动的角色陪伴形象" : "角色陪伴形象"}
      data-draggable={draggable}
      onPointerDown={draggable ? down : undefined}
      onPointerMove={draggable ? move : undefined}
      onPointerUp={draggable ? end : undefined}
      onPointerCancel={draggable ? end : undefined}
      onLostPointerCapture={draggable ? end : undefined}
    >
      <ThemeArtwork name="brush" className="companion-brush" />
      <ThemeArtwork name="foliage" className="companion-foliage" />
      <ThemeArtwork name="ground" className="companion-ground" />
      <ThemeArtwork name="companion" className="companion-portrait" />
    </div>
  );
}
