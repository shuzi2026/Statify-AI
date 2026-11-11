/** A display observer, never a business clock or a source of elapsed time. */
export function observeViewClock({
  read,
  changed,
  document: doc = document,
  window: win = window,
}: {
  read: (now: number) => readonly unknown[];
  changed: (now: number) => void;
  document?: Pick<
    Document,
    "hidden" | "addEventListener" | "removeEventListener"
  >;
  window?: Pick<Window, "addEventListener" | "removeEventListener">;
}) {
  let at = Date.now(),
    previous = read(at);
  let timer: ReturnType<typeof setInterval> | undefined;
  let disposed = false,
    pageHidden = false;
  const stop = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };
  const sample = (force = false) => {
    if (disposed || doc.hidden || pageHidden) return;
    const now = Date.now(),
      next = read(now);
    const update =
      force ||
      now < at ||
      next.length !== previous.length ||
      next.some((value, i) => !Object.is(value, previous[i]));
    at = now;
    previous = next;
    if (update) changed(now);
  };
  const resume = () => {
    if (disposed) return;
    if (doc.hidden || pageHidden) {
      stop();
      return;
    }
    sample(true);
    if (timer === undefined) timer = setInterval(sample, 1000);
  };
  const hide = () => {
    pageHidden = true;
    stop();
  };
  const show = () => {
    pageHidden = false;
    resume();
  };
  if (!doc.hidden) timer = setInterval(sample, 1000);
  doc.addEventListener("visibilitychange", resume);
  win.addEventListener("focus", resume);
  win.addEventListener("pageshow", show);
  win.addEventListener("pagehide", hide);
  return () => {
    disposed = true;
    stop();
    doc.removeEventListener("visibilitychange", resume);
    win.removeEventListener("focus", resume);
    win.removeEventListener("pageshow", show);
    win.removeEventListener("pagehide", hide);
  };
}
