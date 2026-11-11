import { subscribeTheme } from "../themes/runtime";

type Entry = {
  title: HTMLElement;
  face: HTMLElement;
  reset: boolean;
  factor: number;
  low: number;
  high: number;
  pass: number;
};
const entries = new Map<HTMLElement, Entry>(),
  pending = new Set<Entry>();
let observer: ResizeObserver | undefined,
  unsubscribe: (() => void) | undefined,
  frame = 0;
function schedule(entry: Entry, reset = false) {
  entry.reset ||= reset;
  pending.add(entry);
  if (!frame) frame = requestAnimationFrame(measure);
}
function resetAll() {
  for (const entry of entries.values()) schedule(entry, true);
}
function measure() {
  frame = 0;
  const writes: (() => void)[] = [];
  for (const entry of [...pending]) {
    pending.delete(entry);
    const { title, face } = entry;
    if (!face.isConnected || !face.clientWidth || !face.clientHeight) continue;
    if (entry.reset) {
      entry.reset = false;
      entry.factor = 1;
      entry.low = 0.45;
      entry.high = 1;
      entry.pass = 0;
      if (
        face.style.getPropertyValue("--card-text-fit") &&
        face.style.getPropertyValue("--card-text-fit") !== "1"
      ) {
        writes.push(() => {
          face.style.setProperty("--card-text-fit", "1");
          schedule(entry);
        });
        continue;
      }
    }
    const box = title.getBoundingClientRect(),
      category = face
        .querySelector(".fan-card-category")
        ?.getBoundingClientRect(),
      range = document.createRange();
    range.selectNodeContents(title);
    const lines = Array.from(range.getClientRects()).filter((r) => r.width > 0),
      bottom = Math.min(box.bottom, category ? category.top - 0.5 : box.bottom);
    const fits =
      lines.length <= 2 &&
      lines.every(
        (r) =>
          r.left >= box.left - 0.5 &&
          r.right <= box.right + 0.5 &&
          r.top >= box.top - 0.5 &&
          r.bottom <= bottom + 0.5,
      );
    if (entry.factor === 1 && fits) continue;
    if (fits) entry.low = entry.factor;
    else entry.high = entry.factor;
    const done = ++entry.pass >= 5,
      next = done ? entry.low : (entry.low + entry.high) / 2;
    entry.factor = next;
    writes.push(() => {
      face.style.setProperty("--card-text-fit", String(next));
      if (!done) schedule(entry);
    });
  }
  // All text boxes are read before any font changes, including on old WebViews.
  for (const write of writes) write();
}
/** A shared observer fits real glyphs, including native TextZoom, only on resize/name changes. */
export function observeCardText(title: HTMLElement) {
  const face = title.parentElement!;
  if (!observer) {
    observer = new ResizeObserver((rows) => {
      for (const row of rows) {
        const entry = entries.get(row.target as HTMLElement);
        if (entry) schedule(entry, true);
      }
    });
    unsubscribe = subscribeTheme(resetAll);
    window.addEventListener("resize", resetAll);
    window.addEventListener("statify:configuration", resetAll);
  }
  const entry: Entry = {
    title,
    face,
    reset: true,
    factor: 1,
    low: 0.45,
    high: 1,
    pass: 0,
  };
  entries.set(face, entry);
  observer.observe(face);
  schedule(entry, true);
  return () => {
    observer?.unobserve(face);
    entries.delete(face);
    pending.delete(entry);
    if (!entries.size) {
      observer?.disconnect();
      observer = undefined;
      unsubscribe?.();
      window.removeEventListener("resize", resetAll);
      window.removeEventListener("statify:configuration", resetAll);
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };
}
