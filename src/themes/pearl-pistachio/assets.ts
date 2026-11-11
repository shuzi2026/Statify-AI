const asset4 = new URL("../../../assets/素材/Q_浅青柠/SQ005_饮水行动.webp", import.meta.url).href;
const asset2 = new URL("../../../assets/素材/Q_浅青柠/SQ003_阅读行动.webp", import.meta.url).href;
const asset6 = new URL("../../../assets/素材/Q_浅青柠/SQ008_睡眠行动.webp", import.meta.url).href;
const asset5 = new URL("../../../assets/素材/Q_浅青柠/SQ006_步行行动.webp", import.meta.url).href;
const asset3 = new URL("../../../assets/素材/Q_浅青柠/SQ004_书写行动.webp", import.meta.url).href;
const asset0 = new URL("../../../assets/素材/Q_浅青柠/SQ001_背景.webp", import.meta.url).href;
const asset12 = new URL("../../../assets/素材/Q_浅青柠/SQ013_主按钮.webp", import.meta.url).href;
const asset13 = new URL("../../../assets/素材/Q_浅青柠/SQ014_圆形按钮.webp", import.meta.url).href;
const asset8 = new URL("../../../assets/素材/Q_浅青柠/SQ007_卡牌正面.webp", import.meta.url).href;
const asset1 = new URL("../../../assets/素材/Q_浅青柠/SQ002_伙伴.webp", import.meta.url).href;
const asset11 = new URL("../../../assets/素材/Q_浅青柠/SQ012_弹窗边框.webp", import.meta.url).href;
const asset10 = new URL("../../../assets/素材/Q_浅青柠/SQ011_顶部信息面板.webp", import.meta.url).href;
const asset9 = new URL("../../../assets/素材/Q_浅青柠/SQ010_属性面板.webp", import.meta.url).href;
const asset14 = new URL("../../../assets/素材/Q_浅青柠/SQ009_纸面材质.webp", import.meta.url).href;

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
  reading: { src: asset2, width: 512, height: 512 },
  writing: { src: asset3, width: 512, height: 512 },
  drinking: { src: asset4, width: 512, height: 512 },
  walking: { src: asset5, width: 512, height: 512 },
  sleeping: { src: asset6, width: 512, height: 512 },
  paper: { src: asset14, width: 138, height: 134 },
};
export const themeId = "pearl-pistachio";
export const themeName = "柔透 · 浅青柠";
export const colorTokens = {
  "--theme-canvas": "#DAE6AE",
  "--theme-paper": "#F5EEDC",
  "--theme-paper-light": "#E8F0C4",
  "--theme-ink": "#292040",
  "--theme-muted": "#6E627A",
  "--theme-accent": "#E97461",
  "--theme-accent-hover": "#E97461",
  "--theme-growth": "#A18BD0",
  "--theme-lavender": "#C8B9DE",
  "--theme-lavender-light": "#E8F0C4",
  "--theme-line": "#CFC7BD",
  "--theme-shadow": "#716680",
  "--theme-on-accent": "#F5EEDC",
};
