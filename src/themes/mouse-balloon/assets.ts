const asset4 = new URL("../../../assets/素材/M_气球小鼠/SM005_饮水行动.webp", import.meta.url).href;
const asset2 = new URL("../../../assets/素材/M_气球小鼠/SM003_阅读行动.webp", import.meta.url).href;
const asset6 = new URL("../../../assets/素材/M_气球小鼠/SM008_睡眠行动.webp", import.meta.url).href;
const asset5 = new URL("../../../assets/素材/M_气球小鼠/SM006_步行行动.webp", import.meta.url).href;
const asset3 = new URL("../../../assets/素材/M_气球小鼠/SM004_书写行动.webp", import.meta.url).href;
const asset0 = new URL("../../../assets/素材/M_气球小鼠/SM001_背景.webp", import.meta.url).href;
const asset12 = new URL("../../../assets/素材/M_气球小鼠/SM013_主按钮.webp", import.meta.url).href;
const asset13 = new URL("../../../assets/素材/M_气球小鼠/SM014_圆形按钮.webp", import.meta.url).href;
const asset8 = new URL("../../../assets/素材/M_气球小鼠/SM007_卡牌正面.webp", import.meta.url).href;
const asset1 = new URL("../../../assets/素材/M_气球小鼠/SM002_伙伴.webp", import.meta.url).href;
const asset11 = new URL("../../../assets/素材/M_气球小鼠/SM012_弹窗边框.webp", import.meta.url).href;
const asset10 = new URL("../../../assets/素材/M_气球小鼠/SM011_顶部信息面板.webp", import.meta.url).href;
const asset9 = new URL("../../../assets/素材/M_气球小鼠/SM010_属性面板.webp", import.meta.url).href;
const asset14 = new URL("../../../assets/素材/M_气球小鼠/SM009_纸面材质.webp", import.meta.url).href;

export const assets = {
  background: asset0,
  "card-frame": asset8,
  "panel-portrait": asset9,
  "hud-frame": asset10,
  "dialog-frame": asset11,
  "button-blank": asset12,
  "button-round": asset13,
  "paper-quiet": asset14,
};
export const artwork = {
  companion: { src: asset1, width: 1024, height: 1536 },
  reading: { src: asset2, width: 552, height: 512 },
  writing: { src: asset3, width: 535, height: 512 },
  drinking: { src: asset4, width: 449, height: 512 },
  walking: { src: asset5, width: 542, height: 512 },
  sleeping: { src: asset6, width: 538, height: 512 },
  paper: { src: asset14, width: 136, height: 141 },
};
export const themeId = "mouse-balloon";
export const themeName = "绘本 · 气球小鼠";
export const colorTokens = {
  "--theme-canvas": "#8FAEAE",
  "--theme-paper": "#F5E8D0",
  "--theme-paper-light": "#D0DEDA",
  "--theme-ink": "#2C2018",
  "--theme-muted": "#776354",
  "--theme-accent": "#BD5135",
  "--theme-accent-hover": "#BD5135",
  "--theme-growth": "#7B9F9E",
  "--theme-lavender": "#9EACAD",
  "--theme-lavender-light": "#D0DEDA",
  "--theme-line": "#C9B9A4",
  "--theme-shadow": "#4D4E48",
  "--theme-on-accent": "#F5E8D0",
};
