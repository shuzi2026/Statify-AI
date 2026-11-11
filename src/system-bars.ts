import {
  deviceBridge as device,
  hasAndroidBridge,
  type BarColors,
} from "./platform/native";
import { subscribeTheme, themeSnapshot } from "./themes/runtime";
import type { AppTheme } from "./themes/catalog";
import { setLayoutStyle } from "./ui-layout/style-value";

export function systemBarPalette(
  theme: AppTheme,
  paperPage: boolean,
  navigationVisible: boolean,
  white = false,
) {
  const canvas = white ? "#eeeeee" : theme.tokens["--theme-canvas"];
  const paper = white ? "#ffffff" : theme.tokens["--theme-paper"];
  return {
    top: paperPage ? paper : canvas,
    bottom: navigationVisible ? paper : canvas,
  };
}
/** Native owns safe-area padding; this only paints it, without changing geometry. */
export function initializeSystemBars() {
  if (!hasAndroidBridge()) return () => {};
  return observeSystemBarColors((colors) => device.systemBars(colors));
}
export function observeSystemBarColors(
  apply: (colors: BarColors) => Promise<void>,
) {
  const root = document.documentElement,
    blend = document.createElement("div");
  blend.className = "native-window-blend";
  blend.setAttribute("aria-hidden", "true");
  document.body.append(blend);
  let frame = 0,
    last = "",
    stopped = false;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  const paint = (base: string, overlay: string) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = base;
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = "transparent";
    context.fillStyle = overlay;
    context.fillRect(0, 0, 1, 1);
    return (
      "#" +
      Array.from(context.getImageData(0, 0, 1, 1).data)
        .slice(0, 3)
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("")
    );
  };
  const update = () => {
    frame = 0;
    if (stopped) return;
    const nav = document.querySelector<HTMLElement>(".mobile-nav");
    const base = systemBarPalette(
      themeSnapshot(),
      !!document.querySelector(".settings-page, .payment-test-page"),
      !!nav && getComputedStyle(nav).display !== "none",
      root.dataset.whiteModel === "true",
    );
    let colors: BarColors = { ...base };
    for (const dialog of document.querySelectorAll<HTMLDialogElement>(
      "dialog[open]",
    )) {
      const rect = dialog.getBoundingClientRect();
      if (
        !rect.width ||
        !rect.height ||
        getComputedStyle(dialog).visibility === "hidden"
      )
        continue;
      const shade = dialog.querySelector<SVGPathElement>(".guide-shade path"),
        overlay = shade
          ? getComputedStyle(shade).fill
          : getComputedStyle(dialog, "::backdrop").backgroundColor;
      const hole = shade
        ? dialog.querySelector(".guide-shade rect")?.getBoundingClientRect()
        : null;
      colors = {
        top: paint(colors.top, overlay),
        bottom:
          hole && hole.bottom >= innerHeight - 2
            ? colors.bottom
            : paint(colors.bottom, overlay),
        persist: false,
      };
      if (
        !shade &&
        rect.top <= 1 &&
        rect.bottom >= innerHeight - 1 &&
        rect.left <= 1 &&
        rect.right >= innerWidth - 1
      ) {
        const background = getComputedStyle(dialog).backgroundColor;
        colors.top = paint(colors.top, background);
        colors.bottom = paint(colors.bottom, background);
      }
    }
    // The web strip receives the shade itself; only the native inset needs the composite.
    // Hand classes also notify this observer. Rewriting the same inherited
    // token invalidates the whole page in WebView 83 on every swipe.
    setLayoutStyle(root, "--native-window-top", base.top);
    const key = JSON.stringify(colors);
    if (key === last) return;
    last = key;
    void apply(colors).catch(() => {
      if (last === key) last = "";
    });
  };
  const request = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  };
  const unsubscribe = subscribeTheme(request),
    observer = new MutationObserver(request);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "hidden", "open", "data-step"],
  });
  const appearance = new MutationObserver(request);
  appearance.observe(root, {
    attributes: true,
    attributeFilter: ["data-white-model"],
  });
  window.addEventListener("resize", request);
  window.addEventListener("statify:configuration", request);
  request();
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    unsubscribe();
    observer.disconnect();
    appearance.disconnect();
    window.removeEventListener("resize", request);
    window.removeEventListener("statify:configuration", request);
    root.style.removeProperty("--native-window-top");
    blend.remove();
  };
}
