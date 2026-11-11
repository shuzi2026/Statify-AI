import ts from "typescript";
import catalog from "../src/i18n/en.json" with { type: "json" };
// File references are build inputs, even when their names contain Chinese.
export function isModuleReference(node) {
  const parent = node.parent;
  if (!parent) return false;
  return (
    ((ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
      parent.moduleSpecifier === node) ||
    (ts.isNewExpression(parent) &&
      parent.expression.getText() === "URL" &&
      parent.arguments?.[0] === node &&
      parent.arguments?.[1]?.getText() === "import.meta.url")
  );
}
/** Compile-time source-message instrumentation keeps user data out of translation. */
export function internationalTextPlugin(devRegion) {
  let globalBuild = false;
  return {
    name: "statify-source-localization",
    enforce: "pre",
    configResolved(config) {
      globalBuild = (devRegion ?? config.env.VITE_STATIFY_REGION) === "global";
    },
    transformIndexHtml(html, context) {
      const url = new URL(
        context.originalUrl || context.path,
        "http://localhost",
      );
      const queryGlobal = !devRegion && context.server && url.searchParams.get("region") === "global";
      if (
        queryGlobal &&
        html.includes('<iframe src="/index.html"')
      )
        return html.replace(
          '<iframe src="/index.html"',
          '<iframe src="/index.html?region=global"',
        );
      if (!html.includes('id="launch-screen"')) return;
      if (
        !globalBuild && devRegion !== "global" && !queryGlobal
      )
        return;
      const messages = {
        "启动资源连接中断，正在自动重试一次…":
          "The startup connection was interrupted. Retrying once…",
        "首次打开仍在加载界面，请稍候。加载完成后会自动进入，无需再次打开。":
          "The first launch is still loading. Please wait; Statify will open automatically when it is ready.",
        重新尝试: "Try again",
        "启动错误: ": "Startup error: ",
        应用启动异常: "Application startup error",
        关键资源: "Required resource",
        "加载失败: ": "Failed to load: ",
        "把想做的事，变成看得见的成长。":
          "Turn what you want to do into growth you can see.",
        "正在启动 Statify": "Starting Statify",
        "当前运行环境暂不支持此版本，请更新系统 WebView 或浏览器后重试。":
          "This environment does not support this version yet. Update Android System WebView or your browser, then try again.",
        "启动未完成，请重试。现有存档不会被清除。":
          "Startup did not finish. Try again. Your existing save will be kept.",
        重新打开: "Reopen",
        "复制诊断信息，发给开发者": "Copy diagnostics for the developer",
        "已选中，请长按复制": "Selected. Press and hold to copy.",
        已复制: "Copied",
        "如果反复出现此页面，请点击上方按钮复制诊断信息发给开发者，帮助定位问题。":
          "If this screen keeps appearing, use the button above to copy diagnostics and send them to the developer.",
      };
      html = html.replace('lang="zh-CN"', 'lang="en"');
      for (const [source, en] of Object.entries(messages))
        html = html.replaceAll(source, en);
      return html;
    },
    transform(code, id) {
      const file = id.split("?")[0].replaceAll("\\", "/");
      if (
        (!file.includes("/src/") && !file.endsWith("/shared/save-schema.ts")) ||
        !/\.tsx?$/.test(file) ||
        /\/(i18n|payments\/deployment)(\/|\.)/.test(file) ||
        file.endsWith("/platform/capabilities.ts") ||
        file.endsWith("/themes/preview-tools.ts") ||
        file.includes(".test.") ||
        file.endsWith(".d.ts")
      )
        return;
      const ast = ts.createSourceFile(
          file,
          code,
          ts.ScriptTarget.Latest,
          true,
          file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        ),
        edits = [];
      let textUsed = false,
        localeUsed = false;
      const add = (n, value) =>
        edits.push({ start: n.getStart(ast), end: n.end, value });
      const call = (value) => {
        textUsed = true;
        return "__statifyText(" + JSON.stringify(value) + ")";
      };
      function visit(n) {
        if (isModuleReference(n)) return;
        if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
          const parent = n.parent,
            isName =
              (ts.isPropertyAssignment(parent) ||
                ts.isPropertySignature(parent) ||
                ts.isMethodDeclaration(parent)) &&
              parent.name === n;
          if (!isName && Object.hasOwn(catalog, n.text)) {
            // Artwork search terms must continue recognizing user-written Chinese names.
            if (
              file.endsWith("/themes/catalog.ts") &&
              [
                "喝",
                "饮",
                "水",
                "写",
                "笔记",
                "日记",
                "收获",
                "读",
                "书",
              ].includes(n.text)
            )
              return;
            if (ts.isJsxAttribute(parent)) add(n, "{" + call(n.text) + "}");
            else add(n, call(n.text));
          } else if (n.text === "zh-CN" && !isName) {
            localeUsed = true;
            add(n, '(__statifyLocale||"zh-CN")');
          }
        } else if (ts.isJsxText(n)) {
          const key = n.text.trim();
          if (Object.hasOwn(catalog, key)) {
            const prefix = /^\s*/.exec(n.text)[0],
              suffix = /\s*$/.exec(n.text)[0];
            add(
              n,
              "{" +
                JSON.stringify(prefix.includes("\n") ? "" : prefix) +
                "+" +
                call(key) +
                "+" +
                JSON.stringify(suffix.includes("\n") ? "" : suffix) +
                "}",
            );
          }
        } else if (
          (ts.isTemplateHead(n) ||
            ts.isTemplateMiddle(n) ||
            ts.isTemplateTail(n)) &&
          Object.hasOwn(catalog, n.text)
        ) {
          const value = call(n.text);
          add(
            n,
            (ts.isTemplateHead(n) ? "`" : "}") +
              "${" +
              value +
              "}" +
              (ts.isTemplateTail(n) ? "`" : "${"),
          );
        } else if (
          ts.isCallExpression(n) &&
          ts.isPropertyAccessExpression(n.expression) &&
          [
            "toLocaleString",
            "toLocaleDateString",
            "toLocaleTimeString",
          ].includes(n.expression.name.text) &&
          n.arguments.length === 0
        ) {
          localeUsed = true;
          edits.push({
            start: n.end - 1,
            end: n.end - 1,
            value: "__statifyLocale",
          });
        }
        ts.forEachChild(n, visit);
      }
      visit(ast);
      if (!edits.length) return;
      edits.sort((a, b) => b.start - a.start);
      let end = Infinity;
      for (const e of edits) {
        if (e.end > end)
          throw Error("Overlapping locale instrumentation in " + file);
        code = code.slice(0, e.start) + e.value + code.slice(e.end);
        end = e.start;
      }
      const imports = [
        textUsed ? "localize as __statifyText" : null,
        localeUsed ? "uiLocale as __statifyLocale" : null,
      ]
        .filter(Boolean)
        .join(",");
      return {
        code: "import {" + imports + '} from "/src/i18n/runtime.ts";\n' + code,
        map: null,
      };
    },
  };
}
