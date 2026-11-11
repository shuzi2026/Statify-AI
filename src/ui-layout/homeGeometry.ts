import { layoutFactor } from "./workbench-config";
// Ratios use the available app window, not hardware resolution or device names.
export const usesLargeTextLayout = (fontScale: number) => fontScale >= 1.5;
export function homeGeometry(
  width: number,
  height: number,
  expanded: boolean,
  hasActivity = false,
  fontScale = 1,
  attributeCount = 4,
) {
  const w = Math.max(1, width),
    viewportHeight = Math.max(1, height);

  const scroll = usesLargeTextLayout(fontScale) || viewportHeight / w < 1.65;
  const h = scroll
    ? Math.max(viewportHeight, w * 1.9) * Math.max(1, fontScale)
    : viewportHeight;
  const unit = Math.min(w, h * 0.58),
    gutter = w * 0.041 * layoutFactor("gutter"),
    top = h * 0.035;
  // Lift the whole scene as one unit, reserving the largest HUD paint overhang.
  // Native/PWA safe-area insets remain outside this local coordinate system.
  const lift = Math.min(12, Math.max(0, top - 14));
  const hud = h * 0.135 * layoutFactor("hud"),
    meter = w * 0.15,
    gap = h * 0.012,
    activity = hasActivity ? w * 0.15 : 0;
  const stageTop = top + hud + gap + meter + gap + activity;
  const control = h * 0.05,
    nav = Math.min(h * 0.085, w * 0.18),
    footer = h * 0.046;
  // Give numerical attributes priority when the screen is crowded. Reduce the
  // hand within the same bottom anchor instead of crushing the entire panel.
  const minimumRow = Math.min(w * 0.07, h * 0.064),
    cardBudget =
      (h -
        footer -
        h * 0.025 -
        control -
        stageTop -
        gap -
        minimumRow * (attributeCount + 2.1)) /
      1.12;
  const cardHeight = Math.min(
    ((w * 0.405 * 218) / 158) * layoutFactor("cardSize"),
    h * 0.26,
    Math.max(w * 0.2, cardBudget),
  );
  const cardBleed = cardHeight * 0.12;
  const expandedHandTop =
    h - footer - h * 0.025 - cardHeight - control - cardBleed;
  const handTop = expanded ? expandedHandTop : h - nav - h * 0.095 - control;
  const stageHeight = handTop - stageTop - gap;
  // Use the smaller (expanded-hand) budget in both states. Width and height share
  // one scale, so folding the hand never stretches or fattens the attribute paper.
  const row = Math.min(
    w * 0.135,
    h * 0.064,
    (expandedHandTop - stageTop - gap) / (attributeCount + 2.1),
  );
  const values = {
    width: w,
    height: h,
    gutter,
    lift,
    top: top - lift,
    hud,
    meter,
    gap,
    activity,
    stageTop: stageTop - lift,
    stageHeight,
    row,
    panelWide: Math.min(w - 2 * gutter, row * 3.3 * layoutFactor("panelWidth")),
    panelNarrow: Math.min(
      w - 2 * gutter,
      row * 2.25 * layoutFactor("panelWidth"),
    ),
    scrollClip: row * 0.3,
    panelHeight: row * (attributeCount + 2.1),
    cardWidth: ((cardHeight * 158) / 218) * layoutFactor("cardRatio"),
    cardHeight,
    cardBleed,
    control,
    nav,
    footer,
    handTop: handTop - lift,
    handBottom: h - handTop + lift - cardHeight - control,
    unit,
    heroWidth: Math.min(
      Math.min(w * 0.59, (stageHeight * 2) / 3) * 1.1 * layoutFactor("hero"),
      ((stageHeight + gap * 2) * 2) / 3,
    ),
  };
  return {
    scroll,
    values,
    style: Object.fromEntries(
      Object.entries(values).map(([k, v]) => ["--home-" + k, v + "px"]),
    ),
  };
}
