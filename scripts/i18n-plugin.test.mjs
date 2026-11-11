import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { internationalTextPlugin } from "./i18n-plugin.mjs";
import { readFileSync } from "node:fs";
test("platform language identifiers and deployment facts remain untranslated and cycle-free", () => {
  const source = readFileSync("src/platform/capabilities.ts", "utf8");
  assert.match(source, /type Language = "zh-CN" \| "en"/);
  assert.equal(
    internationalTextPlugin().transform(
      source,
      "/src/platform/capabilities.ts",
    ),
    undefined,
  );
});
test("source localization wraps program literals while leaving dynamic user content untouched", () => {
  const code =
      'const view=<button aria-label="新建卡牌">新建卡牌{card.name}</button>;const message=`已加入 ${card.name}`;',
    result = internationalTextPlugin().transform(
      code,
      "D:/LifeRPG/src/Example.tsx",
    );
  assert.match(result.code, /__statifyText\("新建卡牌"\)/);
  assert.match(result.code, /\{card.name\}/);
  assert.doesNotMatch(result.code, /__statifyText\(card.name/);
  assert.equal(
    ts.transpileModule(result.code, {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX },
      reportDiagnostics: true,
    }).diagnostics.length,
    0,
  );
});
test("schema and source date handling are transformed, while test code and runtime avoid recursive translation", () => {
  const plugin = internationalTextPlugin();
  assert.ok(
    plugin.transform(
      'export const x="情绪"',
      "D:/LifeRPG/shared/save-schema.ts",
    ),
  );
  assert.equal(
    plugin.transform('const x="设置"', "D:/LifeRPG/src/a.test.ts"),
    undefined,
  );
  assert.equal(
    plugin.transform('const x="设置"', "D:/LifeRPG/src/i18n/runtime.ts"),
    undefined,
  );
  assert.match(
    plugin.transform("new Date().toLocaleString()", "D:/LifeRPG/src/a.ts").code,
    /toLocaleString\(__statifyLocale\)/,
  );
});
test("production English also covers the HTML launch screen and unsupported-browser fallback before the bundle starts", () => {
  const plugin = internationalTextPlugin(),
    html = readFileSync("index.html", "utf8");
  plugin.configResolved({ env: { VITE_STATIFY_REGION: "global" } });
  const result = plugin.transformIndexHtml(html, { path: "/index.html" });
  assert.match(result, /lang="en"/);
  assert.match(result, /Your existing save will be kept/);
  assert.doesNotMatch(result, /[\u3400-\u9fff]/);
});
test("international preview starts the correct iframe before the toolbar script runs", () => {
  const result = internationalTextPlugin().transformIndexHtml(
    '<iframe src="/index.html"></iframe>',
    {
      path: "/preview.html",
      originalUrl: "/preview.html?region=global",
      server: {},
    },
  );
  assert.match(result, /src="\/index.html\?region=global"/);
});

test("Chinese module and URL paths remain build inputs, while visible text is localized", () => {
  const plugin = internationalTextPlugin();
  const input = `import art from "../../assets/素材/SX001_背景.webp"; const image = new URL("../../assets/素材/SY027_菱格实验稿.png", import.meta.url); const label = "设置";`;
  const result = plugin.transform(input, "/src/example.ts").code;
  assert.ok(result.includes('"../../assets/素材/SX001_背景.webp"'));
  assert.ok(result.includes('"../../assets/素材/SY027_菱格实验稿.png"'));
  assert.match(result, /__statifyText\("设置"\)/);
});
