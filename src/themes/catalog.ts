const companionAtlas = new URL("../../assets/素材/L_薰衣草/SL020_伙伴图集.webp", import.meta.url).href;
const materialAtlas = new URL("../../assets/素材/L_薰衣草/SL021_材质图集.webp", import.meta.url).href;
const cardStock = new URL("../../assets/素材/L_薰衣草/SL007_卡牌正面.webp", import.meta.url).href;
const paintTexture = new URL("../../assets/素材/L_薰衣草/SL022_绘画纹理.webp", import.meta.url).href;
import type { Card } from "../model";
import { ravenAssets, ravenArtwork } from "./raven-wizard/assets";
import { selectedThemes } from "./selected";
import { cardDefaults } from "./card-defaults";
import { configuredThemes } from "../ui-layout/workbench-theme";

/** Presentation only: themes never read or write the character save. */
export type ArtworkName =
  | "companion"
  | "card-default"
  | "reading"
  | "writing"
  | "drinking"
  | "walking"
  | "sleeping"
  | "foliage"
  | "brush"
  | "ground"
  | "paper";
export type Artwork = {
  src: string;
  viewBox?: string;
  width?: number;
  height?: number;
  removeWhite?: boolean;
  bleed?: boolean;
  alphaFloor?: number;
  bodyBounds?: readonly [number, number, number, number];
  bodyAlign?: "center" | "panel-bottom";
};
type PaletteToken =
  | "canvas"
  | "paper"
  | "paper-light"
  | "ink"
  | "muted"
  | "accent"
  | "accent-hover"
  | "growth"
  | "lavender"
  | "lavender-light"
  | "line"
  | "shadow"
  | "on-accent"
  | "paper-image";
export type AppTheme = {
  id: string;
  styleId?: string;
  name: string;
  illustrated: boolean;
  skin?: "selected";
  companionDraggable?: boolean;
  cardSurface?: "image" | "css";
  tokens: typeof common & Record<`--theme-${PaletteToken}`, string>;
  artwork: Partial<Record<ArtworkName, Artwork>>;
  cardArt: {
    names?: string[];
    category?: string;
    method?: Card["method"];
    sleep?: boolean;
    art: ArtworkName;
  }[];
};
const companion = (column: number, row: number): Artwork => ({
  src: companionAtlas,
  viewBox: `${column * 512} ${row * 512} 512 512`,
  width: 1536,
  height: 1024,
});
const material = (viewBox: string): Artwork => ({
  src: materialAtlas,
  viewBox,
  width: 1536,
  height: 1024,
  removeWhite: true,
});
const rules: AppTheme["cardArt"] = [
  { category: "运动", art: "walking" },
  { category: "学习", art: "reading" },
  { category: "工作", art: "writing" },
  { category: "生活", art: "drinking" },
  { sleep: true, art: "sleeping" },
  { names: ["喝", "饮", "水"], art: "drinking" },
  { names: ["写", "笔记", "日记", "收获"], art: "writing" },
  { names: ["读", "阅读", "学习", "书"], art: "reading" },
  { method: "quantity", art: "writing" },
];
const common = {
  "--theme-small-card-image": "var(--theme-card-image)",
  "--theme-card-outset-y-ratio": "0",
  "--theme-card-outset-x-ratio": "0",
  "--theme-radius-panel": "18px",
  "--theme-radius-button": "12px",
  "--theme-radius-card": "8% / 6%",
  "--theme-card-ratio": "158 / 218",
  "--theme-stroke": "1.7",
  "--theme-paper-size": "529.65% 379.26%",
  "--theme-paper-position": "3.85% 7.96%",
  "--theme-card-image": "none",
  "--theme-card-depth":
    "drop-shadow(0 2px 1px #6e52452b) drop-shadow(0 7px 6px #55405b24)",
  "--theme-surface-veil": "82%",
  "--theme-accent-ink":
    "color-mix(in srgb,var(--theme-accent) 80%,var(--theme-ink))",
  "--theme-hud-paper": "var(--theme-paper)",
  "--theme-hud-opacity": "88%",
  "--theme-hud-border": "var(--theme-line)",
  "--theme-hud-outset-top": "0px",
  "--theme-hud-outset-bottom": "0px",
  "--theme-hud-outset-x": "0px",
  "--theme-card-center-veil": "94%",
  "--theme-panel-image": "none",
  "--theme-dialog-image": "none",
  "--theme-button-image": "none",
  "--theme-hud-image": "none",
  "--theme-scene-ink": "var(--theme-ink)",
  "--theme-round-image": "none",
  "--theme-square-image": "none",
  "--theme-card-back-image": "none",
  "--theme-canvas-background":
    "radial-gradient(ellipse at 80% 40%,var(--theme-lavender),transparent 70%),linear-gradient(145deg,var(--theme-lavender-light),var(--theme-canvas))",
};
const baseThemes = {
  "raven-wizard": {
    id: "raven-wizard",
    name: "乌鸦巫师 · 月窗书房",
    illustrated: true,
    companionDraggable: false,
    cardSurface: "image",
    tokens: {
      ...common,
      "--theme-canvas": "#a497ad",
      "--theme-paper": "#f4e7cf",
      "--theme-paper-light": "#fbf1df",
      "--theme-ink": "#201b20",
      "--theme-muted": "#4d4053",
      "--theme-accent": "#a53b38",
      "--theme-accent-hover": "#852d2b",
      "--theme-growth": "#b47776",
      "--theme-lavender": "#8e7b9a",
      "--theme-lavender-light": "#c5b9ca",
      "--theme-line": "#a39a98",
      "--theme-shadow": "#302633",
      "--theme-on-accent": "#fff4df",
      "--theme-hud-paper": "var(--theme-paper-light)",
      "--theme-hud-opacity": "60%",
      "--theme-hud-border":
        "color-mix(in srgb,var(--theme-line) 35%,transparent)",
      "--theme-hud-outset-top": "12px",
      "--theme-hud-outset-bottom": "8px",
      "--theme-hud-outset-x": "3px",
      "--theme-stroke": "1.8",
      "--theme-paper-image": `url("${ravenAssets.paper}")`,
      "--theme-paper-size": "560px 560px",
      "--theme-paper-position": "0 0",
      "--theme-surface-veil": "90%",
      "--theme-card-image": `url("${ravenAssets.card}")`,
      "--theme-card-center-veil": "0%",
      "--theme-small-card-image": `url("${ravenAssets.smallCard}")`,
      "--theme-panel-image": `url("${ravenAssets.panel}")`,
      "--theme-dialog-image": `url("${ravenAssets.dialog}")`,
      "--theme-button-image": `url("${ravenAssets.button}")`,
      "--theme-hud-image": `url("${ravenAssets.button}")`,
      "--theme-round-image": `url("${ravenAssets.round}")`,
      "--theme-square-image": `url("${ravenAssets.square}")`,
      "--theme-card-back-image": `url("${ravenAssets.back}")`,
      "--theme-card-depth":
        "drop-shadow(0 3px 1px #201b2020) drop-shadow(0 7px 6px #30263324)",
      "--theme-canvas-background": `url("${ravenAssets.background}") center / cover no-repeat,var(--theme-canvas)`,
    },
    artwork: { ...ravenArtwork, "card-default": cardDefaults["raven-wizard"] },
    cardArt: rules,
  },
  "paper-lavender": {
    id: "paper-lavender",
    name: "纸绘 · 薰衣草",
    illustrated: true,
    cardSurface: "image",
    tokens: {
      ...common,
      "--theme-canvas": "#e6dfec",
      "--theme-paper": "#faf2e5",
      "--theme-paper-light": "#fffaf2",
      "--theme-ink": "#352b43",
      "--theme-muted": "#6c6075",
      "--theme-accent": "#b9472e",
      "--theme-accent-hover": "#983921",
      "--theme-growth": "#df795e",
      "--theme-lavender": "#c8b9d8",
      "--theme-lavender-light": "#ebe3ef",
      "--theme-line": "#ccbdc9",
      "--theme-shadow": "#544260",
      "--theme-on-accent": "#fffaf2",
      "--theme-paper-image": `url("${paintTexture}")`,
      "--theme-card-image": `url("${cardStock}")`,
      "--theme-paper-size": "560px 560px",
      "--theme-paper-position": "0 0",
      "--theme-surface-veil": "91%",
      "--theme-canvas-background": `linear-gradient(#e6dfecd9,#e6dfecd9),url("${paintTexture}") center / 560px 560px repeat,var(--theme-canvas)`,
    },
    artwork: {
      paper: { src: paintTexture, width: 560, height: 560 },
      companion: companion(0, 0),
      reading: companion(1, 0),
      writing: companion(2, 0),
      drinking: companion(0, 1),
      walking: { ...companion(1, 1), viewBox: "512 520 450 490" },
      sleeping: companion(2, 1),
      foliage: material("22 710 307 294"),
      brush: material("742 24 398 340"),
      ground: material("1190 874 340 120"),
    },
    cardArt: rules,
  },
  peach: {
    id: "peach",
    name: "素色 · 暖桃",
    illustrated: false,
    tokens: {
      ...common,
      "--theme-canvas": "#f5e8d9",
      "--theme-paper": "#fff5e7",
      "--theme-paper-light": "#fffaf3",
      "--theme-ink": "#211e1b",
      "--theme-muted": "#66564a",
      "--theme-accent": "#bf402b",
      "--theme-accent-hover": "#a23324",
      "--theme-growth": "#ef7057",
      "--theme-lavender": "#dfc6b2",
      "--theme-lavender-light": "#f3dcc9",
      "--theme-line": "#dfc6b2",
      "--theme-shadow": "#755239",
      "--theme-on-accent": "#fffaf3",
      "--theme-paper-image": "none",
    },
    artwork: {},
    cardArt: rules,
  },
} satisfies Record<string, AppTheme>;
const builtinThemes: Record<string, AppTheme> = {
  ...baseThemes,
  ...selectedThemes(baseThemes["paper-lavender"]),
};
export const themes: Record<string, AppTheme> = configuredThemes(builtinThemes);
export type ThemeId = keyof typeof themes;
/** Retired recipes stay local for save compatibility; every chooser uses this list. */
export const selectableThemes: AppTheme[] = Object.values(themes).filter(
  (theme) => !["peach", "paper-lavender"].includes(theme.id),
);
export function rebuildWorkbenchThemes() {
  const next = configuredThemes(builtinThemes);
  for (const id of Object.keys(themes)) delete themes[id];
  Object.assign(themes, next);
  selectableThemes.splice(
    0,
    selectableThemes.length,
    ...Object.values(themes).filter(
      (t) => !["peach", "paper-lavender"].includes(t.id),
    ),
  );
}
export function isSelectableThemeId(value: unknown): value is ThemeId {
  return selectableThemes.some((theme) => theme.id === value);
}
export const defaultTheme: ThemeId = "raven-wizard";
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && Object.hasOwn(themes, value);
}
export function cardArtwork(
  card: Pick<Card, "name" | "category" | "method" | "sleep"> &
    Partial<Pick<Card, "artwork">>,
  theme: AppTheme,
): ArtworkName {
  const companion = theme.artwork["card-default"]
    ? "card-default"
    : "companion";
  if (card.artwork && card.artwork !== "auto")
    return card.artwork === "companion" ? companion : card.artwork;
  return (
    theme.cardArt.find(
      (rule) =>
        (!rule.sleep || card.sleep) &&
        (!rule.category || card.category === rule.category) &&
        (!rule.method || card.method === rule.method) &&
        (!rule.names || rule.names.some((name) => card.name.includes(name))),
    )?.art || companion
  );
}
