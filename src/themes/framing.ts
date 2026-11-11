import type { Artwork } from "./catalog";

/** Character-body registration in source pixels, excluding props and atmosphere.
 * These are asset registration data, not screen coordinates. The same aperture
 * and fit policy are used by every selected skin and by the white model. */
export const companionBounds = {
  "mouse-balloon": [250, 560, 610, 940],
  "night-sprout": [205, 635, 570, 705],
  "pearl-pistachio": [215, 245, 610, 1090],
  "pearl-apricot": [235, 308, 570, 1018],
  "bakery-ochre": [205, 335, 735, 865],
} as const;
export const companionScale = {
  "mouse-balloon": 0.88,
  "night-sprout": 0.72,
  "bakery-ochre": 0.78,
  "pearl-pistachio": 1.12,
  "pearl-apricot": 1.12,
} as const;
/** Full character silhouette for collision checks; carried props are excluded. */
export const subjectBounds = {
  ...companionBounds,
  "mouse-balloon": [55, 560, 815, 945],
  "night-sprout": [200, 635, 580, 705],
  "bakery-ochre": [155, 335, 750, 865],
} as const;
export function frameCompanion(
  art: Artwork,
  bounds: readonly [number, number, number, number],
  scale = 1,
): Artwork {
  const [x, y, w, h] = bounds,
    height = h / (0.94 * scale),
    width = (height * 2) / 3;
  return {
    ...art,
    viewBox: `${x + w / 2 - width / 2} ${y + h / 2 - height / 2} ${width} ${height}`,
    bodyBounds: bounds,
    bleed: true,
  };
}

/** Decorative paper can extend beyond the common printable inner rectangle. */
export const frameTokens = {
  "mouse-balloon": {
    "--theme-card-outset-y": "12%",
    "--theme-card-outset-x": "3%",
    "--theme-panel-outset-y": ".34",
  },
  "night-sprout": {
    "--theme-card-outset-y": "4%",
    "--theme-card-outset-x": "2%",
    "--theme-panel-outset-y": ".15",
  },
  "pearl-pistachio": {
    "--theme-card-outset-y": "5%",
    "--theme-card-outset-x": "3%",
    "--theme-panel-outset-y": ".2",
  },
  "pearl-apricot": {
    "--theme-card-outset-y": "5%",
    "--theme-card-outset-x": "3%",
    "--theme-panel-outset-y": ".2",
  },
  "bakery-ochre": {
    "--theme-card-outset-y": "4%",
    "--theme-card-outset-x": "2%",
    "--theme-panel-outset-y": ".12",
  },
} as const;
