import { useEffect, useState } from "react";
const decoded = new Map<string, Promise<boolean>>();
const readySources = new Set<string>();
// WebView 83 can discard a completed Image before its first CSS use. Keep only
// the active theme's card frames alive, not every decoded scene or visited skin.
const activeFrames = new Map<string, HTMLImageElement>();
function loadArtwork(src: string, retainFrame = false) {
  if (typeof Image === "undefined") return Promise.resolve(false);
  // Revisiting a theme needs a live image again; its old completed promise alone
  // cannot restore the browser's resource/decoded-image cache.
  let promise = retainFrame && !activeFrames.has(src) ? undefined : decoded.get(src);
  if (!promise) {
    promise = new Promise<boolean>((resolve) => {
      const img = new Image();
      if (retainFrame) activeFrames.set(src, img);
      img.onload = () => {
        if (img.decode)
          img.decode().then(
            () => resolve(true),
            () => resolve(false),
          );
        else resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = src;
    });
    promise = promise.then((ready) => {
      if (ready) readySources.add(src);
      return ready;
    });
    decoded.set(src, promise);
  }
  return promise;
}
export function decodeArtwork(src: string) {
  return loadArtwork(src);
}
export function useArtworkReady(src?: string) {
  const [loaded, Loaded] = useState("");
  useEffect(() => {
    let active = true;
    if (src)
      void decodeArtwork(src).then((ok) => {
        if (active && ok) Loaded(src);
      });
    return () => {
      active = false;
    };
  }, [src]);
  // Remounting a card/page must not fade already decoded artwork in from zero.
  return !!src && (loaded === src || readySources.has(src));
}
let generation = 0;
/** Colours are synchronous; every surface image is independently enhanced after decode. */
export function paintThemeTokens(
  tokens: Record<string, string>,
  browser?: { background?: string },
) {
  const root = document.documentElement,
    version = ++generation;
  const frameSources = new Set(
    root.dataset.statifyNoAspect === "true"
      ? ["--theme-card-image", "--theme-small-card-image"].flatMap((key) =>
          Array.from((tokens[key] || "").matchAll(/url\(["']?([^"')]+)["']?\)/g), (match) => match[1]),
        )
      : [],
  );
  for (const src of activeFrames.keys())
    if (!frameSources.has(src)) activeFrames.delete(src);
  const surfaces: Record<string, string> = {
    "--theme-card-image": "card",
    "--theme-panel-image": "panel",
    "--theme-hud-image": "hud",
    "--theme-button-image": "button",
    "--theme-round-image": "round",
  };
  for (const surface of Object.values(surfaces))
    root.style.setProperty(`--paint-${surface}-base`, "var(--theme-paper)");
  for (const [key, value] of Object.entries(tokens)) {
    if (browser && key === "--theme-canvas-background") {
      // Let CSS request the image only on surfaces that use it.
      root.style.setProperty(
        key,
        browser.background
          ? value.replace(/url\([^)]*\)/, `url("${browser.background}")`)
          : value,
      );
      continue;
    }
    const urls = Array.from(
      value.matchAll(/url\(["']?([^"')]+)["']?\)/g),
      (m) => m[1],
    );
    if (!urls.length) {
      root.style.setProperty(key, value);
      continue;
    }
    root.style.setProperty(
      key,
      key === "--theme-canvas-background"
        ? "var(--theme-canvas)"
        : key === "--theme-small-card-image"
          ? "var(--theme-card-image)"
          : "none",
    );
    void Promise.all(urls.map((src) => loadArtwork(src, frameSources.has(src)))).then((results) => {
      if (version === generation && results.every(Boolean)) {
        root.style.setProperty(key, value);
        if (surfaces[key])
          root.style.setProperty(
            `--paint-${surfaces[key]}-base`,
            "transparent",
          );
      }
    });
  }
}
