import {
  deviceBridge as device,
  nativePlatform,
  hasAndroidBridge,
} from "./platform/native";
import { platformCapabilities } from "./platform/runtime";
import { themeSnapshot } from "./themes/runtime";
import pkg from "../package.json";
import { usesLargeTextLayout } from "./ui-layout/homeGeometry";
import { writeDevicePreference } from "./local-data/device-preferences";
export const environmentKeys = [
  "appVersion",
  "versionCode",
  "packageName",
  "androidApi",
  "androidVersion",
  "brand",
  "model",
  "webViewPackage",
  "webViewVersion",
  "fontScale",
  "density",
  "insets",
  "imeVisible",
] as const;
/** Explicit allowlist: never collect saves, URLs, account identifiers, tokens or arbitrary errors. */
export async function compatibilityReport() {
  let native: Record<string, unknown> | null = null,
    nativeStatus = "web";
  if (hasAndroidBridge())
    try {
      const raw = await device.environment();
      native = Object.fromEntries(
        environmentKeys
          .filter((key) => key in raw)
          .map((key) => [key, raw[key]]),
      );
      nativeStatus = "available";
    } catch {
      nativeStatus = "unavailable";
    }
  const deployment = platformCapabilities();
  const browser =
    navigator.userAgent.match(
      /(?:Chrome|Chromium|Firefox|Version)\/[\d.]+/,
    )?.[0] || "unknown";
  return {
    schema: 1,
    appVersion: pkg.version,
    platform: nativePlatform(),
    deployment: {
      region: deployment.region,
      environment: deployment.environment,
      platform: deployment.platform,
      status: deployment.status,
      backend: deployment.backend,
      language: deployment.display.language,
      locale: deployment.display.locale ?? "device-default",
      api: deployment.api,
      payment: deployment.payment,
      license: deployment.license,
      cloud: deployment.cloud,
      issues: deployment.issues,
    },
    nativeStatus,
    native,
    browser,
    window: {
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
      visualWidth: visualViewport?.width,
      visualHeight: visualViewport?.height,
      scale: visualViewport?.scale,
    },
    appearance: {
      theme: themeSnapshot().id,
      reducedMotion: matchMedia("(prefers-reduced-motion:reduce)").matches,
      reducedEffects: document.documentElement.dataset.reduceEffects === "true",
      rootFont: getComputedStyle(document.documentElement).fontSize,
      layoutFontScale:
        Number(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--layout-font-scale",
          ),
        ) || 1,
      largeTextLayout: document.documentElement.dataset.largeText === "true",
    },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    onlineHint: navigator.onLine,
    capabilities: {
      resizeObserver: typeof ResizeObserver === "function",
      abortController: typeof AbortController === "function",
      intersectionObserver: typeof IntersectionObserver === "function",
      aspectRatio: CSS.supports("aspect-ratio", "1/1"),
      dialog:
        typeof HTMLDialogElement !== "undefined" &&
        typeof HTMLDialogElement.prototype.showModal === "function",
      indexedDB: !!globalThis.indexedDB,
      crypto: !!globalThis.crypto?.subtle,
      clone: typeof structuredClone === "function",
      broadcast: typeof BroadcastChannel === "function",
      dvh: CSS.supports("height", "100dvh"),
      container: CSS.supports("container-type", "inline-size"),
      colorMix: CSS.supports("color", "color-mix(in srgb,white,black)"),
      compression: typeof CompressionStream !== "undefined",
    },
    navigationMode: "not-detected",
    romBuild: "not-collected",
  };
}
export function setReducedEffects(enabled: boolean) {
  return writeDevicePreference("reducedEffects", enabled);
}
export async function applyNativeFontScale(active: () => boolean = () => true) {
  if (!hasAndroidBridge()) return;
  try {
    const { fontScale } = await device.environment();
    if (
      active() &&
      typeof fontScale === "number" &&
      Number.isFinite(fontScale) &&
      fontScale > 0
    ) {
      document.documentElement.dataset.largeText = String(
        usesLargeTextLayout(fontScale),
      );
      document.documentElement.style.setProperty(
        "--layout-font-scale",
        String(fontScale),
      );
    }
  } catch {
    /* Old hosts remain usable. */
  }
}
