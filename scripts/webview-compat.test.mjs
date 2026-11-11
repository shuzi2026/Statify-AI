import { test } from "node:test";
import assert from "node:assert/strict";
import postcss from "postcss";
import {
  createWebViewCompatibility,
  replaceFunctions,
} from "./webview-compat.mjs";
test("plain state and drag rules retain their cascade after transformed base rules", async () => {
  const input =
    ".category-wheel{width:80px;box-shadow:0 0 4px color-mix(in srgb,black,white)}.category-wheel.is-closed{width:44px;background:transparent}.gallery-card-paper{width:100%;height:100dvh}.plan-drag-card{width:112px;height:158px}";
  const compat = createWebViewCompatibility(process.cwd()),
    result = await postcss([compat.cssPlugin]).process(input, {
      from: undefined,
    }),
    rules = postcss.parse(result.css).nodes;
  assert.equal(rules.length, 8);
  assert.equal(
    rules[3].selector,
    "html[data-statify-legacy] .category-wheel.is-closed",
  );
  assert.match(rules[3].toString(), /width:44px/);
  assert.equal(rules[7].selector, "html[data-statify-legacy] .plan-drag-card");
  assert.match(rules[7].toString(), /width:112px/);
});
test("balanced function replacement preserves nested custom-property percentages", () => {
  assert.equal(
    replaceFunctions(
      "a color-mix(in srgb,var(--accent) calc(var(--heat) * 100%),var(--line)) b",
      "color-mix",
      () => "<fallback>",
    ),
    "a <fallback> b",
  );
});
test("shared fallback CSS preserves native declarations and adds scoped legacy rules", async () => {
  const compat = createWebViewCompatibility(process.cwd()),
    input =
      ".dialog:has(>.child){height:100dvh;font-size:9cqw;color:color-mix(in srgb,var(--accent) 45%,transparent)}";
  const { css } = await postcss([compat.cssPlugin]).process(input, {
    from: undefined,
  });
  assert.ok(css.includes(input));
  assert.match(css, /data-statify-legacy/);
  assert.match(css, /data-sc-has-/);
  assert.match(css, /var\(--sc-vh,1vh\)/);
  assert.match(css, /var\(--sc-cqw,1vw\)/);
  assert.match(css, /var\(--sc-mix-/);
});
test("an explicitly disabled helper is a no-op", async () => {
  const compat = createWebViewCompatibility(process.cwd(), false),
    input = ".x:has(.y){height:100dvh;color:color-mix(in srgb,white,black)}";
  const { css } = await postcss([compat.cssPlugin]).process(input, {
    from: undefined,
  });
  assert.equal(css, input);
  const metadata = compat.vitePlugin.load("\0virtual:statify-webview-compat");
  assert.deepEqual(JSON.parse(metadata.slice("export default ".length)), {
    has: [],
    mixes: [],
    scoped: [],
    containers: [],
  });
});
test("fallbacks preserve valid animation steps and remain inside their media query", async () => {
  const animation = "@keyframes slide{from{height:100dvh}to{height:0}}",
    input = animation + "@media(max-width:600px){.card{height:80dvh}}",
    compat = createWebViewCompatibility(process.cwd());
  const { css } = await postcss([compat.cssPlugin]).process(input, {
      from: undefined,
    }),
    tree = postcss.parse(css);
  assert.equal(tree.nodes[0].toString(), animation);
  assert.equal(tree.nodes.length, 2);
  const media = tree.nodes[1];
  assert.equal(media.name, "media");
  assert.equal(media.nodes.length, 2);
  assert.equal(media.nodes[0].toString(), ".card{height:80dvh}");
  assert.match(media.nodes[1].selector, /data-statify-legacy/);
  assert.match(media.nodes[1].toString(), /var\(--sc-vh,1vh\)/);
});
test("inset expansion keeps calc expressions intact and legacy copies stay self-sufficient", async () => {
  const input =
    ".empty-hand{inset:calc(var(--home-gap) * .4) calc(var(--home-gutter) * 1.5) auto;height:calc(var(--home-height) * .065);padding:.3em}";
  const compat = createWebViewCompatibility(process.cwd());
  const { css } = await postcss([compat.cssPlugin]).process(input, {
    from: undefined,
  });
  assert.ok(css.includes(input));
  const tree = postcss.parse(css);
  assert.equal(tree.nodes.length, 2);
  const copy = tree.nodes[1];
  assert.match(copy.selector, /data-statify-legacy/);
  assert.match(copy.toString(), /top:calc\(var\(--home-gap\) \* \.4\)/);
  assert.match(copy.toString(), /right:calc\(var\(--home-gutter\) \* 1\.5\)/);
  assert.match(copy.toString(), /left:calc\(var\(--home-gutter\) \* 1\.5\)/);
  assert.match(copy.toString(), /bottom:auto/);
  assert.match(copy.toString(), /height:calc\(var\(--home-height\) \* \.065\)/);
  assert.match(copy.toString(), /padding:\.3em/);
});
test("inset shorthand expansion handles one through three values without parenthesis", async () => {
  const input = ".a{inset:0}.b{inset:1px 2px}.c{inset:1px 2px 3px}";
  const compat = createWebViewCompatibility(process.cwd());
  const { css } = await postcss([compat.cssPlugin]).process(input, {
    from: undefined,
  });
  assert.match(css, /.a{[^}]*top:0;[^}]*right:0;[^}]*bottom:0;[^}]*left:0/);
  assert.match(css, /bottom:1px;[^}]*left:2px/);
  assert.match(css, /top:1px;[^}]*right:2px;[^}]*bottom:3px;[^}]*left:2px/);
});
test(":is selectors expand to plain alternatives and legacy copies avoid :where (Chrome 83)", async () => {
  const input = "html[data-theme] :is(.dialog,.plan-date-menu){inset:0}";
  const compat = createWebViewCompatibility(process.cwd());
  const { css } = await postcss([compat.cssPlugin]).process(input, {
    from: undefined,
  });
  assert.ok(css.includes(input));
  assert.ok(!css.includes(":where("));
  assert.match(css, /html\[data-statify-legacy\]\[data-theme\] \.dialog,/);
  assert.match(
    css,
    /html\[data-statify-legacy\]\[data-theme\] \.plan-date-menu\{/,
  );
  assert.match(css, /top:0;/);
});
test(":has nested inside :is still maps to data-sc-has attributes", async () => {
  const input = ".a:is(.dialog,.dialog:has(.compact-creation)){display:block}";
  const compat = createWebViewCompatibility(process.cwd());
  const { css } = await postcss([compat.cssPlugin]).process(input, {
    from: undefined,
  });
  assert.match(css, /\.a\.dialog\[data-sc-has-\d+\]\{display:block\}/);
  assert.match(css, /\.a\.dialog,/);
  assert.ok(!css.includes(":where("));
});

test("multiline :is alternatives keep compounds and pseudo-elements attached", async () => {
  const input = ".card:is(\n .front,\n .back\n)::before{content:''}";
  const compat = createWebViewCompatibility(process.cwd());
  const { css } = await postcss([compat.cssPlugin]).process(input, { from: undefined });
  const copy = postcss.parse(css).nodes[1];
  assert.equal(copy.selector,
    "html[data-statify-legacy] .card.front::before,html[data-statify-legacy] .card.back::before");
});
test("expanded :is and :has order stays deterministic between scan and transform", async () => {
  const input = ".x:is(.a:has(.b),.c){top:0}";
  const compat = createWebViewCompatibility(process.cwd());
  const a = await postcss([compat.cssPlugin]).process(input, {
    from: undefined,
  });
  const b = await postcss([compat.cssPlugin]).process(input, {
    from: undefined,
  });
  assert.equal(a.css, b.css);
  assert.match(a.css, /\.x\.a\[data-sc-has-\d+\],/);
});
