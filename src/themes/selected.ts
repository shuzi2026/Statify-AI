import type { AppTheme } from "./catalog";
import * as mouse from "./mouse-balloon/assets";
import * as night from "./night-sprout/assets";
import * as pistachio from "./pearl-pistachio/assets";
import * as apricot from "./pearl-apricot/assets";
import * as bakery from "./bakery-ochre/assets";
import {
  companionBounds,
  companionScale,
  subjectBounds,
  frameCompanion,
  frameTokens,
} from "./framing";
import { cardDefaults } from "./card-defaults";

/** Material adapters only. Halos, props and contact ground are inside each sprite. */
type SelectedPack =
  | typeof mouse
  | typeof night
  | typeof pistachio
  | typeof apricot
  | typeof bakery;
function create(base: AppTheme, pack: SelectedPack): AppTheme {
  const a = pack.assets,
    dark = pack.themeId === "night-sprout";
  const backdrop =
    pack.themeId === "pearl-pistachio"
      ? { shade: "rgba(39,48,43,.07)", canvas: "#cdd9a5" }
      : pack.themeId === "pearl-apricot"
        ? { shade: "rgba(49,42,49,.05)", canvas: "#eddac5" }
        : null;
  const textColors = {
    "mouse-balloon": ["#5E4D41", "#923F29"],
    "night-sprout": ["#5F5044", "#8D3F2D"],
    "pearl-pistachio": ["#574B65", "#963E44"],
    "pearl-apricot": ["#5E4D63", "#963E44"],
    "bakery-ochre": ["#6E4824", "#8F351A"],
  }[pack.themeId];
  const companion = {
    ...frameCompanion(
      { ...pack.artwork.companion, ...(dark ? { alphaFloor: 0.88 } : {}) },
      companionBounds[pack.themeId],
      companionScale[pack.themeId],
    ),
    bodyBounds: subjectBounds[pack.themeId],
    bodyAlign: pack.themeId.startsWith("pearl-")
      ? ("center" as const)
      : ("panel-bottom" as const),
  };
  return {
    ...base,
    id: pack.themeId,
    name: pack.themeName,
    skin: "selected",
    companionDraggable: false,
    artwork: {
      ...pack.artwork,
      companion,
      "card-default": cardDefaults[pack.themeId],
    },
    tokens: {
      ...base.tokens,
      ...pack.colorTokens,
      ...frameTokens[pack.themeId],
      "--theme-card-outset-y-ratio": String(
        parseFloat(frameTokens[pack.themeId]["--theme-card-outset-y"]) / 100,
      ),
      "--theme-card-outset-x-ratio": String(
        parseFloat(frameTokens[pack.themeId]["--theme-card-outset-x"]) / 100,
      ),
      "--theme-muted": textColors[0],
      "--theme-accent-ink": textColors[1],
      "--theme-paper-light": dark
        ? "#FFF5DF"
        : pack.colorTokens["--theme-paper-light"],
      "--theme-canvas": backdrop?.canvas || pack.colorTokens["--theme-canvas"],
      "--theme-canvas-background": `${backdrop ? `linear-gradient(${backdrop.shade},${backdrop.shade}),` : ""}url("${a.background}") center / cover no-repeat,var(--theme-canvas)`,
      "--theme-paper-image": `url("${a["paper-quiet"]}")`,
      "--theme-paper-size": "100% 100%",
      "--theme-paper-position": "0 0",
      "--theme-card-image": `url("${a["card-frame"]}")`,
      "--theme-card-center-veil": "0%",
      "--theme-panel-image": `url("${a["panel-portrait"]}")`,
      "--theme-dialog-image": `url("${a["dialog-frame"]}")`,
      "--theme-button-image": `url("${a["button-blank"]}")`,
      "--theme-round-image": `url("${a["button-round"]}")`,
      "--theme-square-image": `url("${a["dialog-frame"]}")`,
      "--theme-card-back-image": `url("${a["card-frame"]}")`,
      "--theme-hud-image": `url("${a["hud-frame"]}")`,
      "--theme-scene-ink": dark ? "#F3E6CB" : pack.colorTokens["--theme-ink"],
      "--theme-hud-opacity": dark ? "0%" : "88%",
      "--theme-surface-veil": "90%",
      "--theme-hud-outset-top": dark ? "6px" : "14px",
      "--theme-hud-outset-bottom": dark ? "4px" : "14px",
      "--theme-hud-outset-x": "6px",
      "--theme-card-depth": "none",
    },
  };
}
export function selectedThemes(base: AppTheme) {
  return {
    "mouse-balloon": create(base, mouse),
    "night-sprout": create(base, night),
    "pearl-pistachio": create(base, pistachio),
    "pearl-apricot": create(base, apricot),
    "bakery-ochre": create(base, bakery),
  };
}
