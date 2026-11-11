import { expect, it } from "vitest";
import ids from "../../shared/theme-ids.json";
import { selectableThemes, themes } from "./catalog";
it("every bundled skin can be recorded by the account preference API", () => {
  expect(Object.keys(themes).sort()).toEqual([...ids].sort());
});
it("offers six current skins while keeping the two retired recipes for existing saves", () => {
  expect(selectableThemes).toHaveLength(6);
  expect(selectableThemes.map((theme) => theme.id)).not.toContain("peach");
  expect(selectableThemes.map((theme) => theme.id)).not.toContain(
    "paper-lavender",
  );
  expect(themes.peach).toBeDefined();
  expect(themes["paper-lavender"]).toBeDefined();
});
