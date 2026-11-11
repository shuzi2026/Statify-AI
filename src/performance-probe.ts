// Explicit local measurement mode only; aggregate counters have constant memory cost.
export const performanceProbeEnabled =
  import.meta.env.DEV && import.meta.env.VITE_STATIFY_PERF === "1";
const totals = { commits: 0, renderMs: 0, maximumRenderMs: 0 };
declare global {
  interface Window {
    __statifyPerformance?: typeof totals;
  }
}
export function recordPerformanceCommit(
  _id: string,
  _phase: string,
  duration: number,
) {
  if (!performanceProbeEnabled) return;
  totals.commits++;
  totals.renderMs += duration;
  totals.maximumRenderMs = Math.max(totals.maximumRenderMs, duration);
  window.__statifyPerformance = totals;
}
