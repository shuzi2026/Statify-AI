import type { AppTheme, Artwork, ArtworkName } from "../themes/catalog";
import { cardLightingTokens } from "../themes/card-lighting";
import { frameCompanion } from "../themes/framing";
import { workbenchDefaults } from "./workbench-config";
const surfaces: Record<string, string> = {
  card: "card-image",
  panel: "panel-image",
  hud: "hud-image",
  dialog: "dialog-image",
  button: "button-image",
  meter: "round-image",
  paper: "paper-image",
};
/** New skins inherit a built-in CSS recipe; artwork keeps the existing renderer. */
export function configuredThemes(
  builtin: Record<string, AppTheme>,
): Record<string, AppTheme> {
  const entries = workbenchDefaults().themes,
    result: Record<string, AppTheme> = {};
  for (const id of new Set([
    ...Object.keys(builtin),
    ...Object.keys(entries),
  ])) {
    const config = entries[id] || {},
      base = builtin[config.base || id];
    if (!base) continue;
    const theme: AppTheme = {
      ...base,
      id,
      styleId: base.id,
      name: config.name || base.name,
      tokens: { ...base.tokens },
      artwork: { ...base.artwork },
    };
    for (const [key, value] of Object.entries(config.colors || {}))
      (theme.tokens as Record<string, string>)["--theme-" + key] = value;
    Object.assign(theme.tokens, cardLightingTokens(
      base.id,
      theme.tokens,
      !!(config.colors?.paper || config.colors?.["paper-light"] || config.colors?.accent),
    ));
    for (const [slot, asset] of Object.entries(config.assets || {})) {
      const url = import.meta.env.BASE_URL.replace(/\/$/, "") + asset.src;
      if (slot === "background")
        theme.tokens["--theme-canvas-background"] =
          `url("${url}") center / cover no-repeat,var(--theme-canvas)`;
      else if (surfaces[slot]) {
        (theme.tokens as Record<string, string>)["--theme-" + surfaces[slot]] =
          `url("${url}")`;
        if (slot === "card")
          theme.tokens["--theme-small-card-image"] = `url("${url}")`;
      }
      if ((!surfaces[slot] && slot !== "background") || slot === "paper") {
        let art: Artwork = {
          src: url,
          width: asset.width,
          height: asset.height,
          viewBox: `0 0 ${asset.width} ${asset.height}`,
        };
        if (slot === "companion") {
          const bounds = asset.bounds || [0, 0, asset.width, asset.height];
          art = {
            ...frameCompanion(art, bounds),
            bodyAlign: asset.align || "center",
          };
        }
        theme.artwork[slot as ArtworkName] = art;
      }
    }
    result[id] = theme;
  }
  return result;
}
