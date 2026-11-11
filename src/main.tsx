import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./AppErrorBoundary";
import {
  performanceProbeEnabled,
  recordPerformanceCommit,
} from "./performance-probe";
import { paymentRegion } from "./payments/deployment";
import { Capacitor } from "@capacitor/core";
import { initializeWebUpdates, disposeWebUpdates } from "./web-update";
import "./app-styles.css";
import { finishLaunch } from "./mobile-runtime";
import { appSession, layoutPreview } from "./application/session";
import { GUEST_TEST_ORIGIN } from "../shared/ai-chat";
import { GuestTestReset } from "./app/GuestTestReset";
document.documentElement.lang = paymentRegion === "global" ? "en" : "zh-CN";
const disposeSession = appSession.start();
// Remove the old out-of-tree banner when this module is hot-reloaded.
document.getElementById("statify-error-banner")?.remove();
const hardened = import.meta.env.VITE_STATIFY_HARDENED === "1";
if (layoutPreview)
  void finishLaunch();
const LayoutPreview = hardened
  ? () => null
  : React.lazy(() =>
      import("./ui-layout/LayoutPreview").then((module) => ({
        default: module.LayoutPreview,
      })),
    );
if (import.meta.env.PROD && !Capacitor.isNativePlatform())
  initializeWebUpdates();
const application = (
  <React.StrictMode>
    <AppErrorBoundary onFatal={disposeSession}>
      {layoutPreview ? (
        <React.Suspense fallback={null}>
          <LayoutPreview />
        </React.Suspense>
      ) : (
        <>
          <App />
          {import.meta.env.STATIFY_HOSTED_DEMO === true && location.origin === GUEST_TEST_ORIGIN && <GuestTestReset />}
        </>
      )}
    </AppErrorBoundary>
  </React.StrictMode>
);
const root = createRoot(document.getElementById("root")!);
root.render(
  performanceProbeEnabled ? (
    <React.Profiler id="app" onRender={recordPerformanceCommit}>
      {application}
    </React.Profiler>
  ) : (
    application
  ),
);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    root.unmount();
    disposeSession();
    disposeWebUpdates();
  });
