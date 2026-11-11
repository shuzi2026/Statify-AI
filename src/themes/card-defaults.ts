const mouse = new URL("../../assets/素材/M_气球小鼠/SM018_默认卡牌插画.png", import.meta.url).href;
const night = new URL("../../assets/素材/Y_小芽/SY018_默认卡牌插画.png", import.meta.url).href;
const pistachio = new URL("../../assets/素材/Q_浅青柠/SQ018_默认卡牌插画.png", import.meta.url).href;
const apricot = new URL("../../assets/素材/N_奶油杏/SN018_默认卡牌插画.png", import.meta.url).href;
const bakery = new URL("../../assets/素材/B_麦香面包/SB018_默认卡牌插画.png", import.meta.url).href;
const raven = new URL("../../assets/素材/X_乌鸦/SX018_默认卡牌插画.png", import.meta.url).href;
import type { Artwork } from "./catalog";

/** Card-only cutouts; homepage companions retain their original atmosphere.
 * View boxes frame the entire opaque silhouette with 16px of edge allowance. */
export const cardDefaults: Record<string, Artwork> = {
  "mouse-balloon": {
    src: mouse,
    width: 1024,
    height: 1536,
    viewBox: "53 0 949 1520",
  },
  "night-sprout": {
    src: night,
    width: 1024,
    height: 1536,
    viewBox: "56 68 964 1417",
  },
  "pearl-pistachio": {
    src: pistachio,
    width: 1024,
    height: 1536,
    viewBox: "110 23 811 1454",
  },
  "pearl-apricot": {
    src: apricot,
    width: 1024,
    height: 1536,
    viewBox: "105 30 814 1433",
  },
  "bakery-ochre": {
    src: bakery,
    width: 1024,
    height: 1536,
    viewBox: "48 220 975 1143",
  },
  "raven-wizard": {
    src: raven,
    width: 1024,
    height: 1536,
    viewBox: "35 25 987 1489",
  },
};
