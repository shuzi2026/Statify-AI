import metadata from "virtual:statify-webview-compat";
import { sizeLegacyCard } from "./ui-layout/legacy-card-size";
import { setLayoutStyle as set } from "./ui-layout/style-value";
import { legacyImageStyles } from "./ui-layout/legacy-image-styles";
type StyleMetadata = {
  has: string[];
  mixes: string[];
  scoped: { selector: string; id: number }[];
  containers: string[];
};
const data = metadata as StyleMetadata;
let flushLegacyStyles: (() => void) | undefined;

/** A new page must have its legacy sizes and colours before its first paint. */
export function prepareLegacyPagePaint() {
  flushLegacyStyles?.();
}
function functionEnd(text: string, start: number) {
  let depth = 1,
    end = start;
  for (; end < text.length && depth; end++) {
    if (text[end] === "(") depth++;
    if (text[end] === ")") depth--;
  }
  return end;
}
function split(text: string) {
  let depth = 0,
    start = 0;
  const parts: string[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    if (text[i] === ")") depth--;
    if (text[i] === "," && !depth) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}
export function installLegacyStyles() {
  const supports = (property: string, value?: string) => {
    try {
      return value === undefined
        ? CSS.supports(property)
        : CSS.supports(property, value);
    } catch {
      return false;
    }
  };
  const oldHas = !supports("selector(:has(*))"),
    oldContainers = !supports("width", "1cqw"),
    oldMix = !supports("color", "color-mix(in srgb,white,black)"),
    oldViewport = !supports("height", "100dvh");
  const oldAspect = !supports("aspect-ratio", "1/1");
  if (!oldHas && !oldContainers && !oldMix && !oldViewport && !oldAspect)
    return;
  const root = document.documentElement;
  const viewport = window.visualViewport;
  let viewportHeight = oldViewport ? viewport?.height || innerHeight : 0;
  root.dataset.statifyLegacy = "true";
  if (oldAspect) root.dataset.statifyNoAspect = "true";
  const updateImages = oldAspect ? legacyImageStyles() : undefined;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  const marked = data.has.map(() => new Set<Element>()),
    observed = new Set<Element>(),
    inlineMixes = new Map<string, { raw: string; last: string }>(),
    colors = new Map<string, number[]>();
  let queuedFrame = 0;
  const query = (selector: string) => {
    try {
      return [...document.querySelectorAll<HTMLElement>(selector)];
    } catch {
      return [];
    }
  };
  const isHiddenScene = (element: Element) =>
    !!element.closest(".workspace-scene[hidden], .home-page[hidden]");
  // Scoped to one read phase: never retain computed values across DOM/theme
  // changes, but avoid resolving the same inherited token for every mix.
  function variableReader(style: CSSStyleDeclaration) {
    const values = new Map<string, string>();
    return (key: string) => {
      let value = values.get(key);
      if (value === undefined) {
        value = style.getPropertyValue(key).trim();
        values.set(key, value);
      }
      return value;
    };
  }
  function variables(
    text: string,
    read: (key: string) => string,
    depth = 0,
  ): string {
    if (depth > 12) return "transparent";
    let from = 0,
      out = "";
    for (;;) {
      const at = text.indexOf("var(", from);
      if (at < 0) return out + text.slice(from);
      const end = functionEnd(text, at + 4),
        parts = split(text.slice(at + 4, end - 1)),
        value =
          read(parts[0]) || parts[1] || "transparent";
      out += text.slice(from, at) + variables(value, read, depth + 1);
      from = end;
    }
  }
  function weight(text: string) {
    if (text.startsWith("calc(")) {
      const m = /^calc\(\s*([\d.]+)\s*\*\s*([\d.]+)%\s*\)$/.exec(text);
      return m ? (Number(m[1]) * Number(m[2])) / 100 : NaN;
    }
    return parseFloat(text) / 100;
  }
  function rgba(text: string) {
    const cached = colors.get(text);
    if (cached) return cached;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = "transparent";
    context.fillStyle = text;
    context.fillRect(0, 0, 1, 1);
    const result = Array.from(context.getImageData(0, 0, 1, 1).data);
    if (colors.size >= 512) colors.clear();
    colors.set(text, result);
    return result;
  }
  function mix(expression: string, read: (key: string) => string): string {
    const parts = split(variables(expression.slice(10, -1), read));
    if (parts.length !== 3 || parts[0] !== "in srgb") return "transparent";
    const color = (value: string) => {
      const match = /\s+(calc\(.+\)|[\d.]+%)$/.exec(value);
      return {
        rgba: rgba(match ? value.slice(0, match.index) : value),
        weight: match ? weight(match[1]) : NaN,
      };
    };
    const a = color(parts[1]),
      b = color(parts[2]);
    if (!Number.isFinite(a.weight))
      a.weight = Number.isFinite(b.weight) ? 1 - b.weight : 0.5;
    if (!Number.isFinite(b.weight)) b.weight = 1 - a.weight;
    const total = a.weight + b.weight;
    if (total <= 0) return "transparent";
    const w = a.weight / total,
      z = b.weight / total,
      alpha = (a.rgba[3] / 255) * w + (b.rgba[3] / 255) * z;
    if (!alpha) return "transparent";
    const channel = (i: number) =>
      Math.round(
        (((a.rgba[i] * a.rgba[3]) / 255) * w +
          ((b.rgba[i] * b.rgba[3]) / 255) * z) /
          alpha,
      );
    return `rgba(${channel(0)},${channel(1)},${channel(2)},${Math.min(1, alpha * Math.min(1, total)).toFixed(4)})`;
  }
  function replaceMixes(text: string, style: CSSStyleDeclaration) {
    const read = variableReader(style);
    let from = 0,
      out = "";
    for (;;) {
      const at = text.indexOf("color-mix(", from);
      if (at < 0) return out + text.slice(from);
      const end = functionEnd(text, at + 10);
      out += text.slice(from, at) + mix(text.slice(at, end), read);
      from = end;
    }
  }
  function updateGeometry() {
    if (oldAspect) {
      const cards = query(".fan-card,.gallery-card-paper,.drawn-card-paper")
        .filter(element => !isHiddenScene(element) &&
          !element.matches(".workspace-card-layout .card-paper-controls > .gallery-card-paper"));
      // Resolve layout selectors first, then read all sibling widths before
      // setting heights. Drawn cards own a separate viewport-width budget.
      const widths = new Map(cards
        .filter(element => !element.classList.contains("drawn-card-paper"))
        .map(element => [element, element.offsetWidth] as const));
      for (const element of cards) {
        if (!observed.has(element)) {
          observed.add(element);
          resize.observe(element);
        }
        sizeLegacyCard(element, widths.get(element));
      }
    }
    if (oldContainers) {
      const containers = new Set(data.containers.flatMap(query));
      const sizes = new Map<HTMLElement, { width: number; height: number }>();
      for (const element of containers) {
        if (isHiddenScene(element)) continue;
        if (!observed.has(element)) {
          observed.add(element);
          resize.observe(element);
        }
        // display:none is not a new container size. Keep the last usable
        // units so returning pages do not first paint zero-size text/artwork.
        if (!element.getClientRects().length) continue;
        const s = getComputedStyle(element);
        sizes.set(element, {
          width:
            element.clientWidth -
            parseFloat(s.paddingLeft || "0") -
            parseFloat(s.paddingRight || "0"),
          height:
            element.clientHeight -
            parseFloat(s.paddingTop || "0") -
            parseFloat(s.paddingBottom || "0"),
        });
      }
      for (const [element, { width, height }] of sizes) {
        set(element, "--sc-cqw", `${width / 100}px`);
        set(element, "--sc-cqh", `${height / 100}px`);
      }
    }
  }
  function update() {
    cancelAnimationFrame(queuedFrame);
    queuedFrame = 0;
    cancelAnimationFrame(geometryFrame);
    geometryFrame = 0;
    updateImages?.();
    for (const element of observed)
      if (!element.isConnected) {
        resize.unobserve(element);
        observed.delete(element);
      }
    if (oldViewport)
      set(
        root,
        "--sc-vh",
        `${viewportHeight / 100}px`,
      );
    if (oldHas)
      data.has.forEach((argument, index) => {
        const next = new Set<Element>(),
          direct = argument.trim().startsWith(">"),
          selector = direct ? argument.trim().slice(1).trim() : argument;
        for (const node of query(selector)) {
          let parent = node.parentElement;
          while (parent) {
            next.add(parent);
            if (direct) break;
            parent = parent.parentElement;
          }
        }
        for (const node of marked[index])
          if (!next.has(node)) node.removeAttribute(`data-sc-has-${index}`);
        for (const node of next)
          if (!marked[index].has(node))
            node.setAttribute(`data-sc-has-${index}`, "");
        marked[index] = next;
      });
    updateGeometry();
    if (oldMix) {
      let style = getComputedStyle(root);
      for (const key of ["--theme-accent-ink", "--theme-hud-border"]) {
        const value = root.style.getPropertyValue(key),
          previous = inlineMixes.get(key);
        if (value.includes("color-mix("))
          inlineMixes.set(key, { raw: value, last: "" });
        else if (previous && value !== previous.last) inlineMixes.delete(key);
      }
      for (const [key, value] of inlineMixes) {
        value.last = replaceMixes(value.raw, style);
        set(root, key, value.last);
      }
      style = getComputedStyle(root);
      // getComputedStyle is live. Resolve the inputs before mutating inherited
      // tokens, otherwise each subsequent read forces another style recalculation.
      const read = variableReader(style);
      const mixed = data.mixes.map((expression) => mix(expression, read));
      mixed.forEach((value, id) =>
        set(root, `--sc-mix-${id}`, value),
      );
      const scopes = new Map<HTMLElement, Set<number>>();
      for (const item of data.scoped)
        for (const element of query(item.selector)) {
          if (isHiddenScene(element)) continue;
          let ids = scopes.get(element);
          if (!ids) {
            ids = new Set<number>();
            scopes.set(element, ids);
          }
          ids.add(item.id);
        }
      const scopedValues: [HTMLElement, number, string][] = [];
      for (const [element, ids] of scopes) {
        const own = variableReader(getComputedStyle(element));
        for (const id of ids)
          scopedValues.push([element, id, mix(data.mixes[id], own)]);
      }
      // All inputs are theme/local colour tokens. Read every scope before
      // writing derived colours, so siblings do not force repeated style work.
      for (const [element, id, value] of scopedValues)
        set(element, `--sc-mix-${id}`, value);
    }
    // This full refresh has consumed the current DOM state. Its synchronous
    // token writes are not new input: discard their records before delivery.
    // Subsequent application mutations and ResizeObserver still invalidate.
    observer.takeRecords();
  }
  function queue() {
    if (!queuedFrame) queuedFrame = requestAnimationFrame(update);
  }
  let geometryFrame = 0;
  const resize = new ResizeObserver((entries) => {
    // Resizing a card/container cannot change selector matches or theme colours.
    // New observers deliver once after mount; do not run the entire fallback
    // pipeline again in the middle of the opening animation.
    if (queuedFrame || geometryFrame || entries.every(({ target }) => isHiddenScene(target))) return;
    geometryFrame = requestAnimationFrame(() => {
      geometryFrame = 0;
      if (!queuedFrame) updateGeometry();
    });
  });
  // Pointer movement only changes geometry. Rebuilding :has, container sizes and
  // every mixed color on each of those frames stalls older Android WebViews.
  // Unknown declarations still invalidate, including local --heat/color changes.
  const motion =
    /^(?:--sc-[\w-]+|--(?:stage-hand-drag|hand-drag-y|offset|distance|step|card-drag-[xy]|card-focus-scale|card-handoff-opacity|card-exit-duration|scene-[\w-]+|subject-[\w-]+|raven-[\w-]+)|transform|translate|rotate|scale|left|top|right|bottom|z-index|visibility|opacity|touch-action|animation-delay|animation-name)$/;
  const needsStyleUpdate = (record: MutationRecord) => {
    const before = document.createElement("span").style,
      after = (record.target as HTMLElement).style;
    before.cssText = record.oldValue || "";
    const keys = new Set([...Array.from(before), ...Array.from(after)]);
    return [...keys].some(
      (key) =>
        !motion.test(key) &&
        // ResizeObserver measures the affected containers after a divider move.
        !(key === "grid-template-rows" &&
          (record.target as HTMLElement).classList.contains("workspace-plan-layout")) &&
        (before.getPropertyValue(key) !== after.getPropertyValue(key) ||
          before.getPropertyPriority(key) !== after.getPropertyPriority(key)),
    );
  };
  const hasStyleSelector = data.has.some((selector) =>
    /\[style(?:\W|$)/.test(selector),
  );
  // These hand states only select stacking, transforms and animation pauses.
  // Recomputing every fallback on pointer-down/up stalls the old compositor.
  // If a future :has/container/mixed-colour rule depends on one, keep refreshing.
  const handMotionClasses = new Set(
    ["is-front", "is-interacting", "is-dragging", "is-stage-dragging"].filter(
      (name) => ![...data.has, ...data.containers, ...data.scoped.map(item => item.selector)]
        .some(selector => new RegExp(`\\.${name}(?![\\w-])`).test(selector)),
    ),
  );
  const needsClassUpdate = (record: MutationRecord) => {
    const element = record.target as Element;
    if (!element.matches(".fan-card,.hand-dock,.mobile-player-stage")) return true;
    const before = new Set((record.oldValue || "").split(/\s+/).filter(Boolean)),
      after = new Set(Array.from(element.classList));
    return [...before, ...after].some(name =>
      before.has(name) !== after.has(name) && !handMotionClasses.has(name),
    );
  };
  const observer = new MutationObserver((records) => {
    // One delivery can contain hundreds of our own token writes to the same
    // element. Compare its earliest snapshot with the final style only once.
    const inspected = new Set<Node>();
    if (
      records.some((record) => {
        if (record.type === "attributes" && record.attributeName === "class")
          return needsClassUpdate(record);
        if (
          record.type !== "attributes" ||
          record.attributeName !== "style" ||
          hasStyleSelector
        )
          return true;
        if (inspected.has(record.target)) return false;
        inspected.add(record.target);
        return needsStyleUpdate(record);
      })
    )
      queue();
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: [
      "class",
      "style",
      "open",
      "data-theme",
      "data-skin",
      "data-simple-theme",
      "data-white-model",
      "data-responsive",
      "data-scroll",
      "data-completed",
      "data-completion-closing",
      "data-dense",
    ],
  });
  const resizeViewport = () => {
    // Reading visualViewport during a page commit can flush an unfinished
    // layout. Its height only changes on viewport events.
    if (oldViewport) viewportHeight = viewport?.height || innerHeight;
    queue();
  };
  window.addEventListener("resize", resizeViewport);
  viewport?.addEventListener("resize", resizeViewport);
  flushLegacyStyles = update;
  update();
}
