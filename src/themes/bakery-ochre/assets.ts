const asset4 = new URL("../../../assets/素材/B_麦香面包/SB005_饮水行动.webp", import.meta.url).href;
const asset2 = new URL("../../../assets/素材/B_麦香面包/SB003_阅读行动.webp", import.meta.url).href;
const asset6 = new URL("../../../assets/素材/B_麦香面包/SB008_睡眠行动.webp", import.meta.url).href;
const asset5 = new URL("../../../assets/素材/B_麦香面包/SB006_步行行动.webp", import.meta.url).href;
const asset3 = new URL("../../../assets/素材/B_麦香面包/SB004_书写行动.webp", import.meta.url).href;
const asset0 = new URL("../../../assets/素材/B_麦香面包/SB001_背景.webp", import.meta.url).href;
const asset12 = new URL("../../../assets/素材/B_麦香面包/SB013_主按钮.webp", import.meta.url).href;
const asset13 = new URL("../../../assets/素材/B_麦香面包/SB014_圆形按钮.webp", import.meta.url).href;
const asset8 = new URL("../../../assets/素材/B_麦香面包/SB007_卡牌正面.webp", import.meta.url).href;
const asset1 = new URL("../../../assets/素材/B_麦香面包/SB002_伙伴.webp", import.meta.url).href;
const asset11 = new URL("../../../assets/素材/B_麦香面包/SB012_弹窗边框.webp", import.meta.url).href;
const asset10 = new URL("../../../assets/素材/B_麦香面包/SB011_顶部信息面板.webp", import.meta.url).href;
const asset9 = new URL("../../../assets/素材/B_麦香面包/SB010_属性面板.webp", import.meta.url).href;
const asset14 = new URL("../../../assets/素材/B_麦香面包/SB009_纸面材质.webp", import.meta.url).href;

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
  writing: { src: asset3, width: 526, height: 512 },
  drinking: { src: asset4, width: 498, height: 512 },
  walking: { src: asset5, width: 518, height: 512 },
  sleeping: { src: asset6, width: 566, height: 512 },
  paper: { src: asset14, width: 153, height: 148 },
};
export const themeId = "bakery-ochre";
export const themeName = "厚涂 · 麦香面包";
export const colorTokens = {
  "--theme-canvas": "#D89D47",
  "--theme-paper": "#F7E2AE",
  "--theme-paper-light": "#F4D392",
  "--theme-ink": "#573515",
  "--theme-muted": "#9B713F",
  "--theme-accent": "#BE5030",
  "--theme-accent-hover": "#BE5030",
  "--theme-growth": "#C75832",
  "--theme-lavender": "#C69A62",
  "--theme-lavender-light": "#F4D392",
  "--theme-line": "#D0AD73",
  "--theme-shadow": "#8A5425",
  "--theme-on-accent": "#F7E2AE",
};
