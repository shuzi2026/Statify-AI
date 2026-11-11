export type Box = { x: number; y: number; width: number; height: number };
export function spotlightLayout(
  target: Box | null,
  viewport: { width: number; height: number },
  panel: { width: number; height: number; minHeight?: number },
) {
  const margin = 12,
    gap = 16,
    desiredHeight = Math.min(
      panel.height,
      Math.max(0, viewport.height - margin * 2),
    );
  let w = Math.min(panel.width, Math.max(0, viewport.width - margin * 2));
  const clamp = (v: number, max: number) =>
    Math.max(margin, Math.min(v, Math.max(margin, max)));
  const hole = target
    ? {
        x: Math.max(4, target.x - 6),
        y: Math.max(4, target.y - 6),
        width: Math.max(
          0,
          Math.min(viewport.width - 4, target.x + target.width + 6) -
            Math.max(4, target.x - 6),
        ),
        height: Math.max(
          0,
          Math.min(viewport.height - 4, target.y + target.height + 6) -
            Math.max(4, target.y - 6),
        ),
      }
    : null;
  const verticalSpace = hole
    ? Math.max(
        hole.y - gap - margin,
        viewport.height - hole.y - hole.height - gap - margin,
      )
    : desiredHeight;
  const sideSpace = hole
    ? Math.max(
        hole.x - gap - margin,
        viewport.width - hole.x - hole.width - gap - margin,
      )
    : 0;
  if (verticalSpace < desiredHeight && sideSpace >= 180)
    w = Math.min(w, sideSpace);
  const sideFits = sideSpace >= w;
  // Reading takes precedence when the highlighted area leaves too little room.
  // The minimum includes the footer and a usable scroll viewport, not just text.
  const minimumHeight = Math.min(desiredHeight, panel.minHeight ?? 224);
  const h =
    !sideFits && verticalSpace >= minimumHeight
      ? Math.min(desiredHeight, verticalSpace)
      : desiredHeight;
  const candidates = hole
    ? [
        { x: hole.x + (hole.width - w) / 2, y: hole.y + hole.height + gap },
        { x: hole.x + (hole.width - w) / 2, y: hole.y - h - gap },
        { x: hole.x + hole.width + gap, y: hole.y + (hole.height - h) / 2 },
        { x: hole.x - w - gap, y: hole.y + (hole.height - h) / 2 },
      ]
    : [{ x: (viewport.width - w) / 2, y: (viewport.height - h) / 2 }];
  const positions = candidates.map((p) => ({
    x: clamp(p.x, viewport.width - w - margin),
    y: clamp(p.y, viewport.height - h - margin),
    width: w,
    height: h,
  }));
  const overlap = (p: Box) =>
    hole
      ? Math.max(
          0,
          Math.min(p.x + p.width, hole.x + hole.width) - Math.max(p.x, hole.x),
        ) *
        Math.max(
          0,
          Math.min(p.y + p.height, hole.y + hole.height) -
            Math.max(p.y, hole.y),
        )
      : 0;
  positions.sort((a, b) => overlap(a) - overlap(b));
  return {
    hole,
    panel: positions[0],
    overlaps: overlap(positions[0]) > 0,
    scrolls: h < desiredHeight - 1,
  };
}
