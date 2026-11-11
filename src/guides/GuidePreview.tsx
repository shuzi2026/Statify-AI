import { desktopMinWidth } from "../ui-layout/responsive";
import { animateSafely } from "../ui-layout/animation";
import { useMotionAllowed } from "../ui-layout/useMotionAllowed";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useId,
  useSyncExternalStore,
} from "react";
import { subscribeTheme, themeSnapshot } from "../themes/runtime";
import { startHandDemo, handDemoLift, type HandDemoPhase } from "./hand-motion";
import { Hand, RotateCcw } from "lucide-react";
import { spotlightLayout, type Box } from "./spotlight";
import { tourSteps, tourPlanSplit, type TourScene } from "./tour";
import "./guide.css";

export default function GuidePreview({
  close,
  showScene,
  preview = false,
}: {
  close: () => void;
  showScene: (scene: TourScene) => void;
  preview?: boolean;
}) {
  const theme = useSyncExternalStore(subscribeTheme, themeSnapshot);
  const motionAllowed = useMotionAllowed();
  const [motionPhase, MotionPhase] = useState<HandDemoPhase | "idle">("idle"),
    [index, I] = useState(0),
    [replay, Replay] = useState(0),
    [readyScene, ReadyScene] = useState<TourScene | null>(null),
    [geometry, G] = useState<ReturnType<typeof spotlightLayout> | null>(null),
    [viewport, V] = useState({ width: innerWidth, height: innerHeight });
  const dialog = useRef<HTMLDialogElement>(null),
    panel = useRef<HTMLElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    pointer = useRef<HTMLDivElement>(null),
    ghost = useRef<HTMLDivElement>(null),
    titleId = useId(),
    copyId = useId(),
    step = tourSteps[index];
  const hint = "hint" in step ? step.hint : undefined;
  const [navigationTarget, NavigationTarget] = useState<Box | null>(null);
  const copy =
    viewport.width >= desktopMinWidth && step.scene === "warehouse"
      ? "点击“＋”新建卡牌，点击卡牌查看或编辑。\n\n右侧可以按分类查找。"
      : viewport.width >= desktopMinWidth && step.scene === "timeline"
        ? "左侧上下滚动查看时间轴。\n\n从右侧拖入计划任务，安排日期和时间。"
        : viewport.width >= desktopMinWidth && step.scene === "plans"
          ? "从右侧仓库拖入卡牌。\n\n在左侧设置计划次数，完成行动后计入计划进度。"
          : viewport.width >= desktopMinWidth && step.scene === "navigation"
            ? "上方切换卡牌、记录和设置。\n\n旁边的开关切换计划视图。"
            : step.copy;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      node = dialog.current!;
    node.showModal();
    return () => {
      node.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useLayoutEffect(() => showScene(step.scene), [step.scene, showScene, replay]);
  useLayoutEffect(() => {
    ReadyScene(null);
    if (step.scene !== "navigation") NavigationTarget(null);
    let frame = 0;
    const settlingUntil = performance.now() + 600;
    const visible = (el: Element) => {
      const b = el.getBoundingClientRect(),
        style = getComputedStyle(el);
      return (
        b.width > 0 &&
        b.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        !el.closest('[hidden],[aria-hidden="true"]')
      );
    };
    const findTarget = () =>
      step.selector
        .split(",")
        .flatMap((selector) =>
          Array.from(document.querySelectorAll<HTMLElement>(selector.trim())),
        )
        .find(visible);
    let target = findTarget();
    // The regular mobile home is a fixed canvas. scrollIntoView can still
    // scroll its overflow:hidden ancestor (notably without overflow:clip),
    // shifting the HUD and leaving that offset behind after the guide closes.
    const fixedHome = target?.closest(
      '.mobile-home[data-scroll="false"]',
    )?.parentElement;
    if (fixedHome) {
      fixedHome.scrollTop = 0;
      fixedHome.scrollLeft = 0;
    } else {
      target?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "auto",
      });
    }
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!target?.isConnected || !visible(target)) {
          const next = findTarget();
          if (next !== target) {
            if (target) observer.unobserve(target);
            target = next;
            if (target) observer.observe(target);
          }
        }
        const width = document.documentElement.clientWidth,
          height = window.visualViewport?.height || innerHeight,
          b =
            target?.isConnected && visible(target)
              ? target.getBoundingClientRect()
              : null;
        const box: Box | null =
          b && b.bottom > 0 && b.right > 0 && b.top < height && b.left < width
            ? { x: b.x, y: b.y, width: b.width, height: b.height }
            : null;
        if (step.scene === "navigation") {
          const button = Array.from(
              document.querySelectorAll<HTMLElement>(
                ".mobile-nav button:nth-child(2), .desktop-view-switch",
              ),
            ).find(visible),
            rect = button?.getBoundingClientRect(),
            next = rect
              ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
              : null;
          NavigationTarget((previous) =>
            previous &&
            next &&
            previous.x === next.x &&
            previous.y === next.y &&
            previous.width === next.width &&
            previous.height === next.height
              ? previous
              : next,
          );
        }
        if (box && step.scene === "hand" && width < desktopMinWidth) {
          const card =
            document.querySelector<HTMLElement>(".fan-card.is-front");
          if (card) {
            const lift = handDemoLift(
              card.getBoundingClientRect().height,
              height,
            );
            box.y -= lift;
            box.height += lift;
          }
        }
        if (performance.now() >= settlingUntil)
          ReadyScene(box ? step.scene : null);
        const panelEl = panel.current;
        let naturalHeight = 320,
          minHeight = 224;
        if (panelEl) {
          const scroll = panelEl.querySelector<HTMLElement>(".guide-copy"),
            content = panelEl.querySelector<HTMLElement>(".guide-content"),
            footer = panelEl.querySelector<HTMLElement>("footer"),
            style = getComputedStyle(panelEl);
          const chrome =
            Number.parseFloat(style.paddingTop) +
            Number.parseFloat(style.paddingBottom) +
            Number.parseFloat(style.borderTopWidth) +
            Number.parseFloat(style.borderBottomWidth) +
            (footer?.offsetHeight || 52) +
            8;
          // Measure unconstrained content rather than temporarily resizing the observed
          // panel: that feedback loop previously collapsed the flex scroller to zero.
          naturalHeight =
            (content?.offsetHeight || scroll?.scrollHeight || 220) + chrome;
          minHeight = chrome + 120;
        }
        V((old) =>
          old.width === width && old.height === height
            ? old
            : { width, height },
        );
        G((previous) => {
          const next = spotlightLayout(
            box,
            { width, height },
            {
              width: Math.min(380, width - 24),
              height: naturalHeight,
              minHeight,
            },
          );
          return previous && JSON.stringify(previous) === JSON.stringify(next)
            ? previous
            : next;
        });
        if (performance.now() < settlingUntil) update();
      });
    };
    const observer = new ResizeObserver(update);
    if (target) observer.observe(target);
    if (panel.current) {
      observer.observe(panel.current);
      for (const node of panel.current.querySelectorAll(
        ".guide-content,footer",
      ))
        observer.observe(node);
    }
    const theme = new MutationObserver(update);
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const content = new MutationObserver((rows) => {
      if (
        rows.some(
          (row) =>
            !(
              row.target instanceof Element &&
              row.target.closest(".guide-spotlight")
            ),
        )
      )
        update();
    });
    content.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "aria-hidden"],
    });
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("transitionend", update, true);
    window.visualViewport?.addEventListener("resize", update);
    update();
    const scroll = panel.current?.querySelector(".guide-copy");
    if (scroll) scroll.scrollTop = 0;
    heading.current?.focus({ preventScroll: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      theme.disconnect();
      content.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("transitionend", update, true);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [step, replay]);
  const hole = geometry?.hole;
  useEffect(() => {
    MotionPhase("idle");
    const cursor = pointer.current,
      holder = ghost.current,
      layer = holder?.parentElement;
    if (
      !cursor ||
      !holder ||
      !layer ||
      !hole ||
      !hint ||
      readyScene !== step.scene
    )
      return;
    const box = (selector: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
        (el) => {
          const b = el.getBoundingClientRect();
          return (
            !el.closest('[hidden],[aria-hidden="true"]') &&
            b.width > 0 &&
            b.height > 0 &&
            b.right > 0 &&
            b.x < innerWidth &&
            getComputedStyle(el).visibility !== "hidden"
          );
        },
      );
    const animations: Animation[] = [],
      restore: (() => void)[] = [];
    let frame = 0;
    const reduced = !motionAllowed;
    const center = (b: DOMRect) => ({
      x: b.x + b.width / 2,
      y: b.y + b.height / 2,
    });
    let points: {
        x: number;
        y: number;
        offset: number;
        opacity?: number;
        easing?: string;
      }[] = [],
      duration = 2600,
      easing = "ease-in-out";
    if (step.scene === "hand") {
      const hand = box(".fan-hand");
      if (hand && viewport.width < desktopMinWidth && !reduced)
        return startHandDemo(hand, cursor, MotionPhase);
      const card = box(".fan-card.is-front, .quick-deck .gallery-card-paper"),
        b = card?.getBoundingClientRect();
      if (!b) return;
      const c = center(b),
        span = Math.min(45, b.width * 0.35);
      points =
        viewport.width >= desktopMinWidth
          ? [
              { ...c, offset: 0, opacity: 0 },
              { ...c, offset: 0.3, opacity: 1 },
              { x: c.x, y: c.y + 5, offset: 0.5 },
              { ...c, offset: 1, opacity: 0 },
            ]
          : [
              { ...c, offset: 0 },
              { x: c.x - span, y: c.y, offset: 0.28 },
              { x: c.x + span, y: c.y, offset: 0.55 },
              { ...c, offset: 0.65 },
              { x: c.x, y: Math.max(20, c.y - 70), offset: 1 },
            ];
    } else if (step.scene === "navigation" || step.scene === "warehouse") {
      const el =
        step.scene === "navigation"
          ? box(".mobile-nav button:nth-child(2), .desktop-view-switch")
          : box('#workspace-panel-cards [aria-label="新建卡牌"]');
      if (!el) return;
      const c = center(el.getBoundingClientRect());
      points = [
        { ...c, offset: 0, opacity: 0 },
        { ...c, offset: 0.25, opacity: 1 },
        { x: c.x, y: c.y + 5, offset: 0.45 },
        { ...c, offset: 0.65 },
        { ...c, offset: 1, opacity: 0 },
      ];
    } else if (step.scene === "plans" || step.scene === "timeline") {
      const from = box(
          step.scene === "plans"
            ? ".plan-card-library .gallery-card-paper"
            : ".plan-goal-board .gallery-card-paper",
        ),
        to = box(
          step.scene === "plans"
            ? ".plan-goal-board .gallery-card-paper"
            : ".plan-timeline .gallery-card-paper",
        );
      if (!from || !to) return;
      const a = from.getBoundingClientRect(),
        b = to.getBoundingClientRect(),
        start = center(a),
        end = center(b),
        clone = from.cloneNode(true) as HTMLElement;
      clone.removeAttribute("id");
      const ids = new Map<string, string>();
      clone.querySelectorAll("[id]").forEach((el, i) => {
        const next = titleId + "-demo-" + i;
        ids.set(el.id, next);
        el.id = next;
      });
      clone.querySelectorAll("*").forEach((el) => {
        for (const attribute of Array.from(el.attributes)) {
          let value = attribute.value;
          for (const [old, id] of ids)
            value =
              value === "#" + old
                ? "#" + id
                : value.split("url(#" + old + ")").join("url(#" + id + ")");
          if (value !== attribute.value) el.setAttribute(attribute.name, value);
        }
      });
      clone.setAttribute("aria-hidden", "true");
      clone.inert = true;
      // The clone leaves the plan workspace. Keep the shared drag-card print
      // context as well as its paper class in the guide's top-layer surface.
      clone.className = "guide-demo-card plan-drag-card gallery-card-paper";
      Object.assign(clone.style, {
        left: a.x + "px",
        top: a.y + "px",
        width: a.width + "px",
        height: a.height + "px",
      });
      holder.append(clone);
      // Keep the card and pointer on the same clock as the timeline scroll.
      const grab = 0.18,
        land = 0.55,
        release = 0.65,
        clear = 0.68,
        atSource = "translate(0,0)",
        atTarget = `translate(${end.x - start.x}px,${end.y - start.y}px) scale(${b.width / a.width})`,
        afterRelease = { x: end.x + 10, y: end.y + 8 };
      const path = [
        { transform: atSource, opacity: 0, offset: 0 },
        {
          transform: atSource,
          opacity: 1,
          offset: grab,
          easing: "ease-in-out",
        },
        { transform: atTarget, opacity: 1, offset: land },
        { transform: atTarget, opacity: 1, offset: release },
        { transform: atTarget, opacity: 0, offset: clear },
        { transform: atTarget, opacity: 0, offset: 1 },
      ];
      duration = step.scene === "timeline" ? 4700 : 2800;
      easing = "linear";
      if (!reduced) {
        const animation = animateSafely(clone, path, {
          duration,
          easing,
          fill: "both",
        });
        if (animation) {
          animations.push(animation);
          layer.dataset.cardDrag = "true";
        } else clone.style.display = "none";
      } else clone.style.display = "none";
      points = [
        { ...start, offset: 0, opacity: 0 },
        { ...start, offset: grab, opacity: 1, easing: "ease-in-out" },
        { ...end, offset: land },
        { ...afterRelease, offset: release },
      ];
      if (step.scene === "timeline") {
        const railElement = box(".plan-timeline")!,
          rail = railElement.getBoundingClientRect(),
          r = center(rail),
          desktop = viewport.width >= desktopMinWidth;
        const handle = box(".plan-resize-handle"),
          h = handle ? center(handle.getBoundingClientRect()) : r;
        points.push(
          desktop
            ? { x: r.x, y: r.y + 35, offset: 0.7 }
            : { x: r.x + 35, y: r.y, offset: 0.7 },
          desktop
            ? { x: r.x, y: r.y - 35, offset: 0.82 }
            : { x: r.x - 35, y: r.y, offset: 0.82 },
        );
        if (!desktop)
          points.push(
            { ...h, offset: 0.88 },
            { x: h.x, y: h.y - 18, offset: 0.94 },
          );
        points.push({ ...h, offset: 1, opacity: 0 });
        const layout = railElement.closest<HTMLElement>(
            ".workspace-plan-layout",
          )!,
          rows = layout.style.gridTemplateRows,
          position = desktop ? railElement.scrollTop : railElement.scrollLeft,
          maxScroll = Math.min(
            150,
            desktop
              ? railElement.scrollHeight - railElement.clientHeight
              : railElement.scrollWidth - railElement.clientWidth,
          );
        restore.push(() => {
          if (desktop) railElement.scrollTop = position;
          else railElement.scrollLeft = position;
          layout.style.gridTemplateRows = rows;
        });
        if (!reduced) {
          const startTime = performance.now();
          const move = () => {
            const progress = Math.min(
              1,
              (performance.now() - startTime) / duration,
            );
            if (progress >= clear) {
              const next =
                position + maxScroll * Math.min(1, (progress - clear) / 0.15);
              if (desktop) railElement.scrollTop = next;
              else railElement.scrollLeft = next;
            }
            if (!desktop && progress >= 0.88) {
              const ratio =
                tourPlanSplit -
                0.055 * Math.sin((Math.PI * (progress - 0.88)) / 0.12);
              layout.style.gridTemplateRows = `minmax(0,${ratio}fr) auto minmax(0,${1 - ratio}fr)`;
            }
            if (progress < 1) frame = requestAnimationFrame(move);
          };
          frame = requestAnimationFrame(move);
        }
      } else {
        points.push(
          { ...afterRelease, offset: 0.72, opacity: 0 },
          { ...afterRelease, offset: 1, opacity: 0 },
        );
      }
    }
    if (!points.length) return;
    const frames = points.map((p) => ({
      transform: `translate(${p.x - 8}px,${p.y - 8}px)`,
      opacity: p.opacity ?? 1,
      offset: p.offset,
      easing: p.easing ?? "linear",
    }));
    if (reduced) {
      const last = points[Math.min(1, points.length - 1)];
      cursor.style.transform = `translate(${last.x - 8}px,${last.y - 8}px)`;
      cursor.style.opacity = "1";
    } else {
      const animation = animateSafely(cursor, frames, {
        duration,
        easing,
        fill: "both",
      });
      if (animation) animations.push(animation);
      else {
        const last = points[Math.min(1, points.length - 1)];
        cursor.style.transform = `translate(${last.x - 8}px,${last.y - 8}px)`;
        cursor.style.opacity = "1";
      }
    }
    return () => {
      cancelAnimationFrame(frame);
      animations.forEach((animation) => animation.cancel());
      restore.forEach((fn) => fn());
      holder.replaceChildren();
      delete layer.dataset.cardDrag;
      cursor.style.opacity = "0";
    };
  }, [
    step,
    replay,
    readyScene,
    viewport.width,
    viewport.height,
    theme.id,
    motionAllowed,
  ]);
  const path =
    `M0 0H${viewport.width}V${viewport.height}H0Z` +
    (hole
      ? `M${hole.x} ${hole.y}v${hole.height}h${hole.width}v-${hole.height}Z`
      : "");
  return (
    <dialog
      ref={dialog}
      className="guide-spotlight"
      data-step={index + 1}
      data-scene={step.scene}
      aria-labelledby={titleId}
      aria-describedby={copyId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <svg
        className="guide-shade"
        width="100%"
        height="100%"
        viewBox={`0 0 ${viewport.width} ${viewport.height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d={path} fillRule="evenodd" />
        {hole && (
          <rect
            x={hole.x}
            y={hole.y}
            width={hole.width}
            height={hole.height}
            rx="9"
            key={index}
          />
        )}
      </svg>
      <div className="guide-motion-layer" aria-hidden="true">
        <div ref={ghost} />
        <div ref={pointer} className="guide-demo-pointer">
          <Hand />
        </div>
      </div>
      {hint && step.scene === "navigation" && navigationTarget && (
        <button
          type="button"
          className="guide-target-action"
          aria-label="计划与卡牌"
          style={{
            left: navigationTarget.x,
            top: navigationTarget.y,
            width: navigationTarget.width,
            height: navigationTarget.height,
          }}
          onClick={() => I(tourSteps.findIndex((s) => s.scene === "warehouse"))}
        />
      )}
      <section
        ref={panel}
        className="guide-paper"
        data-narrow={(geometry?.panel.width || 380) < 250 || undefined}
        style={{
          left: geometry?.panel.x || 12,
          top: geometry?.panel.y || 12,
          width: geometry?.panel.width || "calc(100% - 24px)",
          height: geometry?.panel.height || viewport.height - 24,
        }}
      >
        <div
          key={index}
          className="guide-copy"
          tabIndex={0}
          role="region"
          aria-labelledby={titleId}
        >
          <div className="guide-content">
            <header key={"heading-" + index} className="guide-step-header">
              <p className="guide-review-note">
                {preview ? "引导预览" : "界面导览"}{" "}
                <span>
                  {String(index + 1).padStart(2, "0")} <i>/</i>{" "}
                  {String(tourSteps.length).padStart(2, "0")}
                </span>
              </p>
              <div className="guide-step-track" aria-hidden="true">
                <span
                  style={{
                    width: ((index + 1) / tourSteps.length) * 100 + "%",
                  }}
                />
              </div>
              <h2 ref={heading} tabIndex={-1} id={titleId}>
                {step.title}
              </h2>
            </header>
            <div id={copyId} className="guide-body">
              {copy.split("\n\n").map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
            {hint && !["timeline", "plans"].includes(step.scene) && (
              <p className="guide-instruction">
                {step.scene === "hand" && viewport.width >= desktopMinWidth
                  ? "点击卡牌打开详情，再选择“开始”或“完成”。"
                  : step.scene === "navigation" &&
                      viewport.width >= desktopMinWidth
                    ? "点击右上角开关，切换计划视图。"
                    : hint}
              </p>
            )}
            {hint && (
              <div className="guide-operation">
                <div className="guide-operation-heading">
                  {step.scene === "hand" && viewport.width < desktopMinWidth ? (
                    <div
                      className="guide-motion-steps"
                      data-phase={motionPhase}
                      aria-hidden="true"
                    >
                      <span data-action="browse">左右切换</span>
                      <i>→</i>
                      <span data-action="draw">上滑抽牌</span>
                    </div>
                  ) : (
                    <span>
                      {step.scene === "plans"
                        ? viewport.width >= desktopMinWidth
                          ? "从右侧拖入左侧计划"
                          : "拖动卡牌，向上放入"
                        : "操作演示"}
                    </span>
                  )}
                  <button
                    type="button"
                    className="text-button guide-replay"
                    onClick={() => Replay((n) => n + 1)}
                  >
                    <RotateCcw size={13} aria-hidden="true" />
                    重播演示
                  </button>
                </div>
              </div>
            )}
            {geometry && !hole && (
              <p role="status" className="guide-review-note">
                正在展示对应区域…
              </p>
            )}
          </div>
        </div>

        <footer className="dialog-actions">
          <button
            type="button"
            className="text-button guide-skip"
            onClick={close}
          >
            跳过
          </button>
          <button
            type="button"
            disabled={index === 0}
            onClick={() => I((v) => v - 1)}
          >
            上一步
          </button>
          <button
            type="button"
            className="primary"
            onClick={() =>
              index === tourSteps.length - 1 ? close() : I((v) => v + 1)
            }
          >
            {index === tourSteps.length - 1
              ? preview
                ? "结束预览"
                : "完成导览"
              : "OK！"}
          </button>
        </footer>
      </section>
    </dialog>
  );
}
