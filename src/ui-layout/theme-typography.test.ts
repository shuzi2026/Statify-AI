import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import postcss from "postcss";
import { themes } from "../themes/catalog";

const source = fileURLToPath(new URL("../", import.meta.url));
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(dir, entry.name))
      : [join(dir, entry.name)],
  );
}
describe("skins cannot own application typography", () => {
  it("keeps all font roles outside theme tokens, including retired save-compatible skins", () => {
    for (const theme of Object.values(themes))
      expect(
        Object.keys(theme.tokens).filter((key) => /font|typography/.test(key)),
        theme.id,
      ).toEqual([]);
  });
  it("rejects typography overrides scoped to a skin or its illustrated variant", () => {
    const overrides: string[] = [];
    for (const file of files(source).filter((file) => file.endsWith(".css")))
      postcss.parse(readFileSync(file, "utf8")).walkRules((rule) => {
        const skin = /data-(?:theme|skin|illustrated)\s*=/.test(rule.selector);
        rule.walkDecls((decl) => {
          const ownsFontRole =
            /^--(?:theme-)?font/.test(decl.prop) &&
            file !== join(source, "ui-layout", "typography.css");
          if (
            ownsFontRole ||
            (skin &&
              /^(font(?:-|$)|line-height$|letter-spacing$|text-transform$)/.test(
                decl.prop,
              ))
          )
            overrides.push(`${file}:${rule.source?.start?.line} ${decl.prop}`);
        });
      });
    expect(overrides).toEqual([]);
  });
});
