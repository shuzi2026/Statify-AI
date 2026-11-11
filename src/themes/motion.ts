export const cardExitMs = 340;

/** The legacy focus transition has no blur/mask tail to wait for. */
export function cardDepartureMs(instant: boolean) {
  return !instant && document.documentElement.dataset.statifyNoAspect === "true"
    ? 180
    : cardExitMs;
}

/** A visual delay must never leave an action waiting on animationend. */
export function waitForCardExit(
  ms: number,
  signal: AbortSignal,
): Promise<void> {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  if (signal.aborted || document.hidden || reduced.matches)
    return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
      reduced.removeEventListener("change", preference);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const visibility = () => {
        if (document.hidden) finish();
      },
      preference = () => {
        if (reduced.matches) finish();
      };
    const timer = setTimeout(finish, ms);
    document.addEventListener("visibilitychange", visibility);
    reduced.addEventListener("change", preference);
    signal.addEventListener("abort", finish, { once: true });
  });
}
