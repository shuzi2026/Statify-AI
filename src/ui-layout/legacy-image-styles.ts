/** Chrome 83 recreates CSS-variable image values when inherited styles change.
 * Keep image URLs on the original rules, preserving cascade/media/pseudo boxes.
 * The root theme tokens remain the source of truth and only URL changes repaint.
 */
export function legacyImageStyles() {
  const bindings: {
    style: CSSStyleDeclaration;
    property: string;
    source: string;
    priority: string;
    last: string;
  }[] = [];
  const visited = new WeakSet<CSSStyleSheet>();
  const imageToken = /^--theme-[\w-]+-image$/;
  function visit(sheet: CSSStyleSheet | CSSGroupingRule) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (rule instanceof CSSStyleRule) {
        // Read shorthands first. CSSOM exposes empty longhands for unresolved
        // var() shorthands; retaining the authored declaration avoids losing it.
        for (const property of [
          "background",
          "background-image",
          "border-image",
          "border-image-source",
        ]) {
          const source = rule.style.getPropertyValue(property);
          if (/var\(\s*--theme-[\w-]+-image/.test(source))
            bindings.push({
              style: rule.style,
              property,
              source,
              priority: rule.style.getPropertyPriority(property),
              last: source,
            });
        }
      } else if ("cssRules" in rule) visit(rule as CSSGroupingRule);
    }
  }
  function resolve(source: string, read: (key: string) => string): string {
    let from = 0,
      result = "";
    for (;;) {
      const at = source.indexOf("var(", from);
      if (at < 0) return result + source.slice(from);
      let end = at + 4,
        depth = 1;
      for (; end < source.length && depth; end++) {
        if (source[end] === "(") depth++;
        if (source[end] === ")") depth--;
      }
      if (depth) return result + source.slice(from);
      const content = source.slice(at + 4, end - 1),
        comma = content.indexOf(",");
      const key = (comma < 0 ? content : content.slice(0, comma)).trim();
      const value = imageToken.test(key)
        ? read(key) ||
          (comma < 0 ? "none" : resolve(content.slice(comma + 1), read))
        : source.slice(at, end);
      result += source.slice(from, at) + value;
      from = end;
    }
  }
  return () => {
    // Compatibility starts before the main CSS chunk loads. Discover each
    // sheet once when available; later DOM work must reuse the same rule values.
    for (const sheet of Array.from(document.styleSheets)) {
      if (visited.has(sheet)) continue;
      try {
        if (!sheet.cssRules.length) continue;
        visit(sheet);
        visited.add(sheet);
      } catch {
        /* External sheets are not application skins. */
      }
    }
    const computed = getComputedStyle(document.documentElement),
      values = new Map<string, string>();
    const read = (key: string) => {
      if (!values.has(key))
        values.set(key, computed.getPropertyValue(key).trim());
      return values.get(key)!;
    };
    // Read before writing stylesheet rules, just as with the colour fallbacks.
    const next = bindings.map((binding) => resolve(binding.source, read));
    bindings.forEach((binding, index) => {
      if (next[index] === binding.last) return;
      binding.style.setProperty(
        binding.property,
        next[index],
        binding.priority,
      );
      binding.last = next[index];
    });
  };
}
