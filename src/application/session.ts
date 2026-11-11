import { createApplicationLifecycle } from "./lifecycle";
import { application } from "./runtime";
import { load } from "../storage";
import { startPaymentRefresh } from "../payments/client";
import { startCloudSync } from "../cloud/client";
import { startThemePreferenceSync } from "../payments/theme-preference";
import { initializeMobileRuntime } from "../mobile-runtime";
import { initializeWorkbenchDefaults } from "../ui-layout/workbench-runtime";
import { initializeTheme, retainExistingTheme } from "../themes/runtime";
import { recordRuntimeIssue } from "../runtime-diagnostics";
import { platformCapabilities } from "../platform/runtime";
import { initializePreferences, connectPreferences, readPreference } from "../local-data/preferences";
import { applyStoredTheme } from "../themes/runtime";
import { connectReplacementInteraction } from "../local-data/replacement-interaction";
import { initializeCardMotion } from "../cards/card-motion";
import { initializeCardLighting } from "../cards/card-lighting-runtime";
import { isGuestPreview } from "../payments/preview-access";

export const layoutPreview =
  import.meta.env.VITE_STATIFY_HARDENED !== "1" &&
  new URLSearchParams(location.search).has("layoutPreview");

export const appSession = createApplicationLifecycle({
  prepare: [
    () => {
      if (platformCapabilities().issues.length)
        recordRuntimeIssue(
          "initialization",
          new Error("Platform configuration"),
          { category: "configuration" },
        );
    },
    initializeMobileRuntime,
    initializeCardMotion,
    initializeCardLighting,
    initializeWorkbenchDefaults,
    initializeTheme,
    connectReplacementInteraction,
  ],
  load: async () => {
    if (layoutPreview) return;
    await initializePreferences();
    applyStoredTheme();
    const state = await load();
    // A shared legacy key cannot establish a regional theme choice.
    if (state.profile.onboarded && readPreference("theme").status !== "shared-legacy")
      await retainExistingTheme();
  },
  online: layoutPreview || isGuestPreview() ? [] : [startPaymentRefresh],
  afterLocal: layoutPreview
    ? []
    : [
        () => {
          return application.connect();
        },
        connectPreferences,
        ...(isGuestPreview() ? [] : [startThemePreferenceSync, startCloudSync]),
      ],
  report: (error) => recordRuntimeIssue("initialization", error),
});
