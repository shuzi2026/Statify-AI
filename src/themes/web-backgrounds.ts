import type { ThemeId } from "./catalog";

/** Browser derivatives retain the original dimensions and theme framing. */
export const webBackgrounds: Partial<Record<ThemeId, string>> = {
  "bakery-ochre": new URL(
    "../../assets/素材/B_麦香面包/SB001_背景-web.webp",
    import.meta.url,
  ).href,
  "mouse-balloon": new URL(
    "../../assets/素材/M_气球小鼠/SM001_背景-web.webp",
    import.meta.url,
  ).href,
  "pearl-apricot": new URL(
    "../../assets/素材/N_奶油杏/SN001_背景-web.webp",
    import.meta.url,
  ).href,
  "pearl-pistachio": new URL(
    "../../assets/素材/Q_浅青柠/SQ001_背景-web.webp",
    import.meta.url,
  ).href,
  "raven-wizard": new URL(
    "../../assets/素材/X_乌鸦/SX001_背景-web.webp",
    import.meta.url,
  ).href,
  "night-sprout": new URL(
    "../../assets/素材/Y_小芽/SY001_背景-web.webp",
    import.meta.url,
  ).href,
};
