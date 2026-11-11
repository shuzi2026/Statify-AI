import { describe, it, expect } from "vitest";
import { spotlightLayout, type Box } from "./spotlight";
const intersection = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
describe("tour placement", () => {
  it("prioritizes the required reading area when the target leaves only a sliver", () => {
    const result = spotlightLayout(
      { x: 0, y: 80, width: 320, height: 300 },
      { width: 320, height: 480 },
      { width: 296, height: 340, minHeight: 240 },
    );
    expect(result.panel.height).toBeGreaterThanOrEqual(240);
    expect(result.overlaps).toBe(true);
  });
  it("uses a narrower side panel to keep six attributes unobscured on a short phone", () => {
    const target = { x: 12, y: 215, width: 78, height: 220 },
      layout = spotlightLayout(
        target,
        { width: 320, height: 640 },
        { width: 340, height: 300 },
      );
    expect(layout.panel.width).toBeGreaterThanOrEqual(180);
    expect(intersection(layout.hole!, layout.panel)).toBe(0);
  });
  it("scrolls a long explanation below a full-width plan instead of covering it", () => {
    const layout = spotlightLayout(
      { x: 12, y: 90, width: 296, height: 270 },
      { width: 320, height: 640 },
      { width: 340, height: 420 },
    );
    expect(layout.scrolls).toBe(true);
    expect(layout.panel.height).toBeLessThan(420);
    expect(layout.overlaps).toBe(false);
  });
  it("keeps the complete panel inside representative portrait and landscape windows", () => {
    for (const width of [320, 390, 760, 1440])
      for (const height of [480, 640, 844, 1000])
        for (const target of [
          null,
          { x: 8, y: height * 0.2, width: width * 0.2, height: height * 0.5 },
          { x: 0, y: 0, width, height },
        ]) {
          const { panel } = spotlightLayout(
            target,
            { width, height },
            { width: 340, height: 450 },
          );
          expect(panel.x).toBeGreaterThanOrEqual(12);
          expect(panel.y).toBeGreaterThanOrEqual(12);
          expect(panel.x + panel.width).toBeLessThanOrEqual(width - 12);
          expect(panel.y + panel.height).toBeLessThanOrEqual(height - 12);
        }
  });
});
