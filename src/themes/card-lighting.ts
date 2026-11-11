/** Built-in finishes are tuned against their printed card frames. */
const printedFinishes: Record<string, readonly [string, string, string, string]> = {
  "raven-wizard": ["#d2caba", "#c3b398", "#f6edda", "#c1b08f"],
  "mouse-balloon": ["#ecdfcf", "#d8c4ac", "#fbefdf", "#c9ac93"],
  "night-sprout": ["#e5e0ec", "#d7cfdf", "#f4f0f8", "#cfc3dd"],
  "pearl-pistachio": ["#dae2d4", "#c6d0bb", "#f3f1df", "#a2b096"],
  "pearl-apricot": ["#eedfd4", "#e3cdbd", "#fcf0e0", "#cfac95"],
  "bakery-ochre": ["#e9d6b7", "#d9be94", "#faedd1", "#c5a574"],
};

function blendHex(from: string, to: string, weight: number) {
  const channels = [1, 3, 5].map((offset) => {
    const a = parseInt(from.slice(offset, offset + 2), 16);
    const b = parseInt(to.slice(offset, offset + 2), 16);
    return Math.round(a + (b - a) * weight).toString(16).padStart(2, "0");
  });
  return "#" + channels.join("");
}

export function cardLightingTokens(
  baseId: string,
  palette: Record<"--theme-paper" | "--theme-paper-light" | "--theme-accent", string>,
  customized: boolean,
) {
  const paper = palette["--theme-paper"];
  const accent = palette["--theme-accent"];
  const light = blendHex(palette["--theme-paper-light"], "#ffffff", 0.45);
  // Resolve custom colours when the theme is assembled so older WebViews
  // receive plain colours and the animation never calculates a palette.
  const [prism, metal, highlight, glow] =
    (!customized && printedFinishes[baseId]) || [
      blendHex(paper, accent, 0.12),
      blendHex(paper, accent, 0.25),
      light,
      blendHex(light, accent, 0.38),
    ];
  return {
    "--theme-card-light-prism": prism,
    "--theme-card-light-metal": metal,
    "--theme-card-light-highlight": highlight,
    "--theme-card-light-glow": glow,
  };
}
