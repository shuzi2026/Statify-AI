// Registration points belong to these illustrations, not to any phone model.
export const ravenScene = {
  footY: 1496 / 1536,
  floorY: 0.75,
  backgroundAspect: 887 / 1774,
};

/** Paint enough of the original scene to cover the home, with its stone floor at the feet. */
export function ravenBackdrop(width: number, height: number, feet: number) {
  const { floorY, backgroundAspect } = ravenScene,
    bleed = Math.max(width * 0.04, height * 0.02);
  const imageHeight = Math.max(
    height * 1.65,
    (width * 1.6) / backgroundAspect,
    (feet + bleed) / floorY,
    (height - feet + bleed) / (1 - floorY),
  );
  return { height: imageHeight, top: feet - imageHeight * floorY };
}
