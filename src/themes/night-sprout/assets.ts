const asset4 = new URL("../../../assets/素材/Y_小芽/SY005_饮水行动.webp", import.meta.url).href;
const asset2 = new URL("../../../assets/素材/Y_小芽/SY003_阅读行动.webp", import.meta.url).href;
const asset6 = new URL("../../../assets/素材/Y_小芽/SY008_睡眠行动.webp", import.meta.url).href;
const asset5 = new URL("../../../assets/素材/Y_小芽/SY006_步行行动.webp", import.meta.url).href;
const asset3 = new URL("../../../assets/素材/Y_小芽/SY004_书写行动.webp", import.meta.url).href;
const asset0 = new URL("../../../assets/素材/Y_小芽/SY001_背景.webp", import.meta.url).href;
const asset12 = new URL("../../../assets/素材/Y_小芽/SY013_主按钮.webp", import.meta.url).href;
const asset13 = new URL("../../../assets/素材/Y_小芽/SY014_圆形按钮.webp", import.meta.url).href;
const asset8 = new URL("../../../assets/素材/Y_小芽/SY007_卡牌正面.webp", import.meta.url).href;
const asset1 = new URL("../../../assets/素材/Y_小芽/SY002_伙伴.webp", import.meta.url).href;
const asset11 = new URL("../../../assets/素材/Y_小芽/SY012_弹窗边框.webp", import.meta.url).href;
const asset10 = new URL("../../../assets/素材/Y_小芽/SY011_顶部信息面板.webp", import.meta.url).href;
const asset9 = new URL("../../../assets/素材/Y_小芽/SY010_属性面板.webp", import.meta.url).href;
const asset14 = new URL("../../../assets/素材/Y_小芽/SY009_纸面材质.webp", import.meta.url).href;

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
  reading: { src: asset2, width: 557, height: 523 },
  writing: { src: asset3, width: 488, height: 523 },
  drinking: { src: asset4, width: 491, height: 523 },
  walking: { src: asset5, width: 530, height: 501 },
  sleeping: { src: asset6, width: 512, height: 501 },
  paper: { src: asset14, width: 129, height: 122 },
};
export const themeId = "night-sprout";
export const themeName = "纸绘 · 夜色小芽";
export const colorTokens = {
  "--theme-canvas": "#36304F",
  "--theme-paper": "#F3E6CB",
  "--theme-paper-light": "#49405F",
  "--theme-ink": "#241F20",
  "--theme-muted": "#786B61",
  "--theme-accent": "#CF765F",
  "--theme-accent-hover": "#CF765F",
  "--theme-growth": "#B497C8",
  "--theme-lavender": "#9488B4",
  "--theme-lavender-light": "#49405F",
  "--theme-line": "#C5B69D",
  "--theme-shadow": "#171424",
  "--theme-on-accent": "#F3E6CB",
};
