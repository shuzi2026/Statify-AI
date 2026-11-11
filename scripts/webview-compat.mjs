import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";
export function replaceFunctions(value, name, replace) {
  let from = 0,
    result = "";
  for (;;) {
    const at = value.indexOf(name + "(", from);
    if (at < 0) return result + value.slice(from);
    let end = at + name.length + 1,
      depth = 1;
    for (; end < value.length && depth; end++) {
      if (value[end] === "(") depth++;
      if (value[end] === ")") depth--;
    }
    if (depth) return result + value.slice(from);
    result += value.slice(from, at) + replace(value.slice(at, end));
    from = end;
  }
}
export function createWebViewCompatibility(root, enabled = true) {
  const has = [],
    mixes = [],
    scoped = [],
    containers = new Set();
  const splitTop = (value, sep = ",") => {
    let depth = 0,
      start = 0,
      out = [];
    for (let i = 0; i < value.length; i++) {
      if (value[i] === "(") depth++;
      if (value[i] === ")") depth--;
      if (value[i] === sep && !depth) {
        out.push(value.slice(start, i));
        start = i + 1;
      }
    }
    out.push(value.slice(start));
    return out;
  };
  const findEnd = (value, start) => {
    let depth = 1,
      end = start;
    for (; end < value.length && depth; end++) {
      if (value[end] === "(") depth++;
      if (value[end] === ")") depth--;
    }
    return end;
  };
  // :is() needs Chrome 88: expand it into equivalent comma alternatives so the
  // legacy copy matches on older engines (e.g. the Android 10 WebView, Chrome 83).
  const expandIs = (selector) => {
    const at = selector.indexOf(":is(");
    if (at < 0) return [selector];
    const end = findEnd(selector, at + 4);
    const before = selector.slice(0, at),
      after = selector.slice(end),
      out = [];
    for (const arg of splitTop(selector.slice(at + 4, end - 1), ","))
      // Formatting inside :is() is not a descendant combinator. In particular,
      // a final newline must not turn .back::before into .back ::before.
      out.push(...expandIs(before + arg.trim() + after));
    return out;
  };
  const hasSelector = (selector) =>
    expandIs(selector)
      .map((alternative) =>
        replaceFunctions(alternative, ":has", (value) => {
          const argument = value.slice(5, -1);
          let id = has.indexOf(argument);
          if (id < 0) {
            id = has.length;
            has.push(argument);
          }
          return `[data-sc-has-${id}]`;
        }),
      )
      .join(",");
  const mixValue = (value) =>
    replaceFunctions(value, "color-mix", (expression) => {
      let id = mixes.indexOf(expression);
      if (id < 0) {
        id = mixes.length;
        mixes.push(expression);
      }
      return `var(--sc-mix-${id})`;
    });
  const fallbackValue = (value) => {
    let text = mixValue(value);
    text = replaceFunctions(text, "env", (expression) => {
      const parts = splitTop(expression.slice(4, -1));
      return parts[1]?.trim() || "0px";
    });
    text = replaceFunctions(text, "clamp", (expression) => {
      const parts = splitTop(expression.slice(6, -1));
      return parts[1]?.trim() || parts[0]?.trim() || "";
    });
    text = replaceFunctions(text, "min", (expression) => {
      const parts = splitTop(expression.slice(4, -1));
      return parts[parts.length - 1]?.trim() || "";
    });
    return text.replace(
      /(-?(?:\d*\.)?\d+)([dsl]vh|cq[wh])/g,
      (_, n, unit) =>
        `calc(var(--sc-${unit.endsWith("vh") ? "vh" : unit},1${unit.endsWith("vh") ? "vh" : "vw"}) * ${n})`,
    );
  };
  const expandInset = (value) => {
    const parts = splitTop(value.trim(), " ").filter(Boolean);
    const map =
      parts.length === 1
        ? [parts[0], parts[0], parts[0], parts[0]]
        : parts.length === 2
          ? [parts[0], parts[1], parts[0], parts[1]]
          : parts.length === 3
            ? [parts[0], parts[1], parts[2], parts[1]]
            : [parts[0], parts[1], parts[2], parts[3]];
    return { top: map[0], right: map[1], bottom: map[2], left: map[3] };
  };
  function gather(css) {
    const parsed = postcss.parse(css);
    parsed.walkRules((rule) => {
      hasSelector(rule.selector);
      rule.walkDecls((decl) => {
        if (decl.prop === "container-type")
          containers.add(hasSelector(rule.selector));
        mixValue(decl.value);
      });
    });
  }
  function scan(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) scan(path);
      else if (entry.name.endsWith(".css")) gather(readFileSync(path, "utf8"));
    }
  }
  if (enabled) scan(join(root, "src"));
  function scopedSelector(selector) {
    return selector
      .split(/,(?![^()]*\))/)
      .map((part) =>
        part
          .trim()
          .replace(/::[\w-]+(?:\([^)]*\))?/g, "")
          .replace(
            /:(hover|active|focus-visible|focus-within|focus)(?![\w-])/g,
            "",
          ),
      )
      .filter(Boolean)
      .join(",");
  }
  // Pre-collect selectors so the virtual module is deterministic before CSS transforms finish.
  function collect(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) collect(path);
      else if (entry.name.endsWith(".css")) {
        postcss.parse(readFileSync(path, "utf8")).walkRules((rule) =>
          rule.walkDecls((decl) => {
            replaceFunctions(decl.value, "color-mix", (expression) => {
              scoped.push({
                selector: scopedSelector(hasSelector(rule.selector)),
                id: mixes.indexOf(expression),
              });
              return expression;
            });
          }),
        );
      }
    }
  }
  if (enabled) collect(join(root, "src"));
  // Plain attribute selectors only: :where() needs Chrome 88 and would kill every
  // legacy copy on the Android 10 WebView (Chrome 83).
  const prefix = (selector) =>
    selector
      .split(/,(?![^()]*\))/)
      .map((part) => {
        const s = part.trim();
        return s.startsWith(":root")
          ? s.replace(":root", ":root[data-statify-legacy]")
          : s.startsWith("html")
            ? s.replace(/^html/, "html[data-statify-legacy]")
            : `html[data-statify-legacy] ${s}`;
      })
      .join(",");
  // Every ordinary rule gets the same legacy prefix, including later plain
  // state rules. Selective copies raise only some selectors' specificity and
  // let early base styles defeat later closed/drag/layout overrides.
  const cssPlugin = {
    postcssPlugin: "statify-webview-fallbacks",
    Once(css) {
      if (!enabled) return;
      const rules = [];
      css.walkRules((rule) => rules.push(rule));
      for (const rule of rules) {
        if (
          rule.parent?.type === "atrule" &&
          /keyframes$/.test(rule.parent.name)
        )
          continue;
        const selector = hasSelector(rule.selector),
          copy = rule.clone({ selector: prefix(selector) });
        copy.walkDecls((decl) => {
          if (decl.prop === "inset") {
            const sides = expandInset(decl.value);
            decl.replaceWith(
              postcss.decl({ prop: "top", value: sides.top }),
              postcss.decl({ prop: "right", value: sides.right }),
              postcss.decl({ prop: "bottom", value: sides.bottom }),
              postcss.decl({ prop: "left", value: sides.left }),
            );
            return;
          }
          const value = fallbackValue(decl.value);
          if (value !== decl.value) {
            decl.value = value;
          }
        });
        rule.after(copy);
      }
    },
  };
  const virtual = "virtual:statify-webview-compat";
  return {
    vitePlugin: {
      name: "statify-webview-compat",
      resolveId(id) {
        if (id === virtual) return "\0" + virtual;
      },
      load(id) {
        if (id === "\0" + virtual)
          return `export default ${JSON.stringify({ has, mixes, scoped, containers: [...containers] })}`;
      },
    },
    cssPlugin,
  };
}
