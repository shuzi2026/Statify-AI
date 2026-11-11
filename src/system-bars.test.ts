import { describe, it, expect } from "vitest";
import { systemBarPalette } from "./system-bars";
import { themes } from "./themes/catalog";
describe("system bar palette", () => {
  it.each(Object.values(themes))(
    "follows $id canvas, paper page and bottom navigation",
    (theme) => {
      expect(systemBarPalette(theme, false, false)).toEqual({
        top: theme.tokens["--theme-canvas"],
        bottom: theme.tokens["--theme-canvas"],
      });
      expect(systemBarPalette(theme, true, true)).toEqual({
        top: theme.tokens["--theme-paper"],
        bottom: theme.tokens["--theme-paper"],
      });
      expect(systemBarPalette(theme, false, true).bottom).toBe(
        theme.tokens["--theme-paper"],
      );
    },
  );
  it("keeps white-model paint coherent without changing the saved theme", () => {
    expect(systemBarPalette(themes["raven-wizard"], false, true, true)).toEqual(
      { top: "#eeeeee", bottom: "#ffffff" },
    );
    expect(themes["raven-wizard"].tokens["--theme-canvas"]).toBe("#a497ad");
  });
});
