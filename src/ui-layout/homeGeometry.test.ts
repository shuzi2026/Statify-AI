import { it, expect } from "vitest";
import { homeGeometry } from "./homeGeometry";

it("keeps moderate system fonts in the phone stage and gives accessibility text a scroll layout", () => {
  for (const count of [4, 6])
    for (const [width, height] of [
      [320, 640],
      [393, 820],
    ]) {
      const ordinary = homeGeometry(width, height, true, true, 1.25, count),
        large = homeGeometry(width, height, true, true, 1.5, count);
      expect(ordinary.scroll).toBe(false);
      expect(ordinary.values.height).toBe(height);
      expect(large.scroll).toBe(true);
      expect(large.values.height).toBeGreaterThan(height);
      for (const { values: g } of [ordinary, large]) {
        expect(g.panelHeight).toBeLessThanOrEqual(g.stageHeight + 1e-6);
        expect(g.stageTop + g.stageHeight).toBeLessThan(g.handTop);
      }
    }
});

it("keeps six numerical attributes readable with an active timer without overlapping the hand", () => {
  for (const [w, h] of [
    [320, 568],
    [320, 640],
    [375, 667],
    [390, 844],
    [480, 800],
    [600, 960],
    [640, 360],
  ]) {
    const folded = homeGeometry(w, h, false, true, 1, 6).values,
      expanded = homeGeometry(w, h, true, true, 1, 6).values;
    expect(expanded.row / w, `${w}x${h}`).toBeGreaterThanOrEqual(0.069);
    for (const g of [folded, expanded]) {
      expect(g.stageHeight).toBeGreaterThanOrEqual(g.panelHeight - 1e-6);
      expect(g.cardWidth / g.cardHeight).toBeCloseTo(158 / 218);
      expect(g.stageTop + g.stageHeight).toBeLessThan(g.handTop);
    }
    expect(folded.row).toBe(expanded.row);
    expect(folded.panelHeight).toBe(expanded.panelHeight);
  }
});
