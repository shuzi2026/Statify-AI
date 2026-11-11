import { paymentRegion } from "./payments/deployment";
import { buildIdentity } from "./build-identity";
import { createDiagnostics, type DiagnosticStore } from "./diagnostics-core.js";
import { sharedService } from "./application/lifecycle";
export type { RuntimeIssue } from "./diagnostics-core.js";
declare global {
  interface Window {
    __statifyDiagnostics?: DiagnosticStore;
  }
}
const store =
  (typeof window !== "undefined" && window.__statifyDiagnostics) ||
  createDiagnostics({
    region: paymentRegion,
    buildId: buildIdentity.buildId,
    storage: () => sessionStorage,
  });
export const runtimeIssues = store.snapshot;
export const subscribeRuntimeIssues = store.subscribe;
export const recordRuntimeIssue = store.record;
export const diagnosticRequestId = store.requestId;
export const initializeRuntimeDiagnostics = sharedService(() => {
  const error = (event: ErrorEvent) =>
      recordRuntimeIssue("error", event.error || event.message),
    rejection = (event: PromiseRejectionEvent) =>
      recordRuntimeIssue("async", event.reason);
  window.addEventListener("error", error);
  window.addEventListener("unhandledrejection", rejection);
  return () => {
    window.removeEventListener("error", error);
    window.removeEventListener("unhandledrejection", rejection);
  };
});
