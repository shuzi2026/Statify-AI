import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { desktopMinWidth, mobileMaxWidth, layoutMedia } from "./responsive";

function styles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory()
      ? styles(path)
      : path.endsWith(".css")
        ? [path]
        : [];
  });
}

describe("the shared integer viewport boundary", () => {
  it("assigns 759 to mobile and 760 to desktop", () => {
    expect(mobileMaxWidth).toBe(759);
    expect(desktopMinWidth).toBe(760);
    expect(layoutMedia).toEqual({
      mobile: "(max-width:759px)",
      desktop: "(min-width:760px)",
    });
  });
  it("keeps native CSS media queries aligned with the JS boundary without overlap", () => {
    const mobile: string[] = [],
      desktop: string[] = [],
      overlap: string[] = [];
    for (const file of styles("src")) {
      postcss.parse(readFileSync(file, "utf8")).walkAtRules("media", (rule) => {
        for (const match of rule.params.matchAll(
          /\((min|max)-width:\s*(\d+)px\)/g,
        )) {
          const width = Number(match[2]);
          if (![mobileMaxWidth, desktopMinWidth].includes(width)) continue;
          if (match[1] === "max" && width === mobileMaxWidth) mobile.push(file);
          else if (match[1] === "min" && width === desktopMinWidth)
            desktop.push(file);
          else overlap.push(`${file}: ${rule.params}`);
        }
      });
    }
    expect(overlap).toEqual([]);
    expect(mobile.length).toBeGreaterThan(0);
    expect(desktop.length).toBeGreaterThan(0);
  });
});
