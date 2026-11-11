import {
  Activity,
  BookOpen,
  Briefcase,
  CalendarDays,
  Heart,
  House,
  LayoutGrid,
  ListFilter,
  type LucideIcon,
} from "lucide-react";
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
import {
  collectionOptions,
  type CollectionId,
  type CollectionOption,
} from "./card-collection";
import type { State } from "./model";

const filterIcons: Record<string, LucideIcon> = {
  all: LayoutGrid,
  favorites: Heart,
  planned: CalendarDays,
  "category:生活": House,
  "category:学习": BookOpen,
  "category:工作": Briefcase,
  "category:运动": Activity,
};
export function HomeCardFilter({
  s,
  value,
  change,
}: {
  s: State;
  value: CollectionId;
  change: (value: CollectionId) => void;
}) {
  const [open, Open] = useState(false),
    [position, Position] = useState<CSSProperties>(),
    id = useId();
  const trigger = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null),
    options = collectionOptions(s, true);
  const items: CollectionOption[] = [
    { id: "all", label: "全部", group: "view" },
    { id: "favorites", label: "常用", group: "view" },
    { id: "planned", label: "计划", group: "plan" },
    ...options.filter((o) => o.group === "category" && o.id !== "category:"),
  ];
  const close = (restore = false) => {
    Open(false);
    if (restore) trigger.current?.focus({ preventScroll: true });
  };
  const choose = (selection: CollectionId) => {
    change(selection);
    close(true);
  };
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const button = trigger.current;
      if (!button) return;
      const create = button
          .closest(".hand-controls,.hand-toolbar")
          ?.querySelector<HTMLButtonElement>('[aria-label="新建卡牌"]'),
        b = (create || button).getBoundingClientRect(),
        viewport = window.visualViewport;
      const left = viewport?.offsetLeft || 0,
        top = viewport?.offsetTop || 0,
        width = viewport?.width || innerWidth,
        height = viewport?.height || innerHeight;
      const home = button.closest(".mobile-home"),
        unit = home
          ? parseFloat(getComputedStyle(home).getPropertyValue("--home-unit"))
          : Math.min(width, 480),
        margin = unit * 0.025,
        gap = unit * 0.015;
      const menuWidth = Math.min(width - margin * 2, 104),
        y = b.bottom + gap;
      Position({
        left: Math.max(
          left + margin,
          Math.min(
            b.left + (b.width - menuWidth) / 2,
            left + width - margin - menuWidth,
          ),
        ),
        top: y,
        width: menuWidth,
        maxHeight: Math.max(
          0,
          Math.min(top + height - y - margin, unit * 0.85),
        ),
        "--filter-unit": unit + "px",
      } as CSSProperties);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (trigger.current) observer.observe(trigger.current);
    const scroll = (e: Event) => {
      if (!panel.current?.contains(e.target as Node)) measure();
    };
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", scroll, true);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", scroll, true);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      const target = e.target as Node;
      if (
        !panel.current?.contains(target) &&
        !trigger.current?.contains(target)
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
    const frame = requestAnimationFrame(() => {
      const item =
        panel.current?.querySelector<HTMLButtonElement>(
          "[aria-checked=true]",
        ) || panel.current?.querySelector<HTMLButtonElement>("button");
      item?.focus({ preventScroll: true });
      item?.scrollIntoView({ block: "nearest" });
    });
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);
  function keys(e: KeyboardEvent<HTMLDivElement>) {
    if (
      ![
        "ArrowDown",
        "ArrowUp",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
      ].includes(e.key)
    )
      return;
    const buttons = Array.from(
        panel.current?.querySelectorAll<HTMLButtonElement>("button") || [],
      ),
      index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? buttons.length - 1
          : Math.max(
              0,
              Math.min(
                buttons.length - 1,
                index +
                  (e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1),
              ),
            );
    e.preventDefault();
    buttons[next]?.focus({ preventScroll: true });
    buttons[next]?.scrollIntoView({ block: "nearest" });
  }
  function item(option: CollectionOption, index: number) {
    const Icon = filterIcons[option.id] || LayoutGrid;
    return (
      <button
        key={option.id}
        type="button"
        role="menuitemradio"
        aria-checked={value === option.id}
        style={{ "--filter-step": index } as CSSProperties}
        onClick={() => choose(option.id)}
      >
        <Icon aria-hidden="true" />
        <span>{option.label}</span>
      </button>
    );
  }
  return (
    <div className="home-card-filter" data-gesture-ignore>
      <button
        ref={trigger}
        type="button"
        className="icon-button"
        aria-label="首页分类与计划筛选"
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
        <ListFilter aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="menu"
            aria-label="筛选首页卡牌"
            className="home-filter-popover"
            data-gesture-ignore
            style={position || { visibility: "hidden" }}
            onKeyDown={keys}
            onClick={(e) => {
              e.stopPropagation();
              if (e.target === e.currentTarget) close();
            }}
          >
            {items.map(item)}
          </div>,
          document.body,
        )}
    </div>
  );
}
