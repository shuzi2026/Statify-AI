export type HandDemoPhase = "browse" | "draw" | "restore";
const ease = (t: number) => {
  const n = Math.max(0, Math.min(1, t));
  return n * n * (3 - 2 * n);
};
export function handDemoLift(cardHeight: number, viewportHeight: number) {
  return Math.min(cardHeight * 0.7, viewportHeight * 0.17);
}

/** Moves the actual hand with the same variables used by its normal drag gesture. */
export function startHandDemo(
  hand: HTMLElement,
  cursor: HTMLElement,
  onPhase: (phase: HandDemoPhase) => void,
) {
  const cards = Array.from(
    hand.querySelectorAll<HTMLElement>(".fan-card[data-card-id]"),
  );
  if (!cards.length) return () => {};
  const snapshots = cards.map((card) => ({
    card,
    style: card.getAttribute("style"),
    className: card.className,
    ariaCurrent: card.getAttribute("aria-current"),
  }));
  const front = Math.max(
    0,
    cards.findIndex((card) => card.getAttribute("aria-current") === "true"),
  );
  const next = front < cards.length - 1 ? front + 1 : Math.max(0, front - 1),
    direction = next - front;
  const chosen = cards[next],
    base = cards.map(
      (card) => Number(card.style.getPropertyValue("--offset")) || 0,
    );
  const lift = handDemoLift(chosen.getBoundingClientRect().height, innerHeight),
    duration = 5600,
    start = performance.now();
  const dock = hand.closest<HTMLElement>(".hand-dock"),
    hadDrag = dock?.classList.contains("is-dragging");
  dock?.classList.add("is-dragging");
  let frame = 0,
    lastPhase: HandDemoPhase | undefined;
  const phase = (value: HandDemoPhase) => {
    if (lastPhase !== value) {
      lastPhase = value;
      hand.dataset.tourMotion = value;
      onPhase(value);
    }
  };
  const render = (time: number) => {
    const t = Math.min(1, (time - start) / duration);
    const wheel =
      t < 0.12
        ? 0
        : t < 0.38
          ? ease((t - 0.12) / 0.26)
          : t < 0.84
            ? 1
            : 1 - ease((t - 0.84) / 0.16);
    const rise =
      t < 0.46
        ? 0
        : t < 0.65
          ? ease((t - 0.46) / 0.19)
          : t < 0.74
            ? 1
            : 1 - ease((t - 0.74) / 0.1);
    phase(t < 0.46 ? "browse" : t < 0.84 ? "draw" : "restore");
    cards.forEach((card, i) => {
      const offset = base[i] - direction * wheel,
        distance = Math.abs(offset);
      card.style.setProperty("--offset", String(offset));
      card.style.setProperty("--distance", String(distance));
      card.style.zIndex = String(
        i === next && rise > 0 ? 90 : 30 - Math.round(distance * 10),
      );
      card.classList.toggle("is-front", distance < 0.5);
      card.setAttribute("aria-current", distance < 0.5 ? "true" : "false");
    });
    chosen.classList.toggle("is-card-dragging", rise > 0);
    chosen.style.setProperty("--card-drag-y", -lift * rise + "px");
    const finger = (rise > 0 ? chosen : cards[front]).getBoundingClientRect();
    cursor.style.opacity = t > 0.94 ? String((1 - t) / 0.06) : "1";
    cursor.style.transform = `translate(${finger.x + finger.width / 2 - 8}px,${finger.y + finger.height * 0.65 - 8}px)`;
    if (t < 1) frame = requestAnimationFrame(render);
    else restore();
  };
  const restore = () => {
    for (const saved of snapshots) {
      if (saved.style === null) saved.card.removeAttribute("style");
      else saved.card.setAttribute("style", saved.style);
      saved.card.className = saved.className;
      if (saved.ariaCurrent === null)
        saved.card.removeAttribute("aria-current");
      else saved.card.setAttribute("aria-current", saved.ariaCurrent);
    }
    if (!hadDrag) dock?.classList.remove("is-dragging");
    delete hand.dataset.tourMotion;
    cursor.style.opacity = "0";
  };
  frame = requestAnimationFrame(render);
  return () => {
    cancelAnimationFrame(frame);
    restore();
  };
}
