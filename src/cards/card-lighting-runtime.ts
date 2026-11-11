let observer: IntersectionObserver | undefined;
const layers = new WeakMap<Element, HTMLSpanElement>();

export function observeCardLighting(layer: HTMLSpanElement | null) {
  const card = layer?.parentElement;
  if (!layer || !card || !observer) return;
  const current = observer;
  layer.setAttribute("data-lighting-offscreen", "");
  layers.set(card, layer);
  current.observe(card);
  return () => {
    current.unobserve(card);
    layers.delete(card);
  };
}

export function initializeCardLighting() {
  if (typeof IntersectionObserver === "function") {
    observer = new IntersectionObserver((entries) => {
      for (const { target, isIntersecting } of entries) {
        layers.get(target)?.toggleAttribute("data-lighting-offscreen", !isIntersecting);
      }
    });
  }
  const root = document.documentElement;
  const authoredDelays = new WeakMap<Element, Map<string, number>>();
  const pending = new Map<HTMLElement | SVGElement, { duration: number; delay: number }>();
  const restarted = new Set<Element>();
  let syncFrame = 0, clearFrame = 0;
  const visibility = () => root.toggleAttribute("data-lighting-background", document.hidden);
  // New loops join the same clock after scrolling, filtering or returning to a tab.
  const synchronize = (event: AnimationEvent) => {
    if (!["hand-foil-sweep", "hand-firefly-glimmer", "hand-foil-sweep-light", "hand-firefly-glimmer-light"].includes(event.animationName))
      return;
    const target = event.target;
    if (!(target instanceof HTMLElement || target instanceof SVGElement)) return;
    if (typeof target.getAnimations !== "function") {
      if (restarted.delete(target)) return;
      // WebView 83 can deliver animationstart well after the CSS start time.
      // Updating only its delay therefore leaves a startup-dependent phase.
      // Restart newly visible lights together on one rendering frame instead.
      const style = getComputedStyle(target),
        duration = parseFloat(style.animationDuration) * 1000;
      if (!Number.isFinite(duration) || duration <= 0) return;
      let delays = authoredDelays.get(target);
      if (!delays) authoredDelays.set(target, delays = new Map());
      if (!delays.has(event.animationName))
        delays.set(event.animationName, parseFloat(style.animationDelay) * 1000 || 0);
      pending.set(target, { duration, delay: delays.get(event.animationName)! });
      if (!syncFrame) syncFrame = requestAnimationFrame(clock => {
        syncFrame = 0;
        const batch = [...pending].filter(([el]) => el.isConnected);
        pending.clear();
        const names = batch.map(([el]) => el.style.animationName);
        for (const [el, timing] of batch) {
          el.style.animationName = "none";
          el.style.animationDelay = `${timing.delay - clock % timing.duration}ms`;
          restarted.add(el);
        }
        // One style flush for the batch; no geometry read or persistent loop.
        if (batch.length) void getComputedStyle(batch[0][0]).animationName;
        batch.forEach(([el], index) => { el.style.animationName = names[index]; });
        cancelAnimationFrame(clearFrame);
        clearFrame = requestAnimationFrame(() => { clearFrame = 0; restarted.clear(); });
      });
      return;
    }
    for (const animation of target.getAnimations()) {
      if ("animationName" in animation && animation.animationName === event.animationName &&
          animation.playState === "running") animation.startTime = 0;
    }
  };
  visibility();
  document.addEventListener("visibilitychange", visibility);
  root.addEventListener("animationstart", synchronize);
  return () => {
    observer?.disconnect();
    observer = undefined;
    cancelAnimationFrame(syncFrame);
    cancelAnimationFrame(clearFrame);
    pending.clear();
    restarted.clear();
    document.removeEventListener("visibilitychange", visibility);
    root.removeEventListener("animationstart", synchronize);
  };
}
