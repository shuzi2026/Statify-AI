import { onPaymentResume } from "./transport";
import { recordRuntimeIssue } from "../runtime-diagnostics";

/** Coalesce resume signals and wait for offline identity restoration first. */
export function startAccountLifecycle(options: {
  initialize: (active: () => boolean) => Promise<void>;
  refresh: () => Promise<void>;
  poll?: () => Promise<void>;
  dispose: () => void;
  interval?: number;
}) {
  let disposed = false,
    pending = false;
  const active = () => !disposed;
  const run = (work: () => Promise<void>) => {
    if (disposed || pending) return;
    pending = true;
    void Promise.resolve()
      .then(() => {
        if (!disposed) return work();
      })
      .catch((error) => {
        if (!disposed) recordRuntimeIssue("initialization", error);
      })
      .finally(() => {
        pending = false;
      });
  };
  const refresh = () => run(options.refresh);
  const visible = () => {
    if (document.visibilityState === "visible") refresh();
  };
  const removeNative = onPaymentResume(refresh);
  const timer = options.interval
    ? setInterval(() => run(options.poll ?? options.refresh), options.interval)
    : undefined;
  window.addEventListener("online", refresh);
  window.addEventListener("focus", refresh);
  window.addEventListener("pageshow", refresh);
  if (typeof document !== "undefined")
    document.addEventListener("visibilitychange", visible);
  run(() => options.initialize(active));
  return () => {
    if (disposed) return;
    disposed = true;
    options.dispose();
    clearInterval(timer);
    removeNative();
    window.removeEventListener("online", refresh);
    window.removeEventListener("focus", refresh);
    window.removeEventListener("pageshow", refresh);
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", visible);
  };
}
