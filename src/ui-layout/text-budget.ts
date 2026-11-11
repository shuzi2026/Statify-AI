/** Browser measurement is presentation validation; persisted names are never cropped. */
export function graphemes(value: string): string[] {
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locale?: string,
        options?: { granularity: string },
      ) => { segment: (v: string) => Iterable<{ segment: string }> };
    }
  ).Segmenter;
  if (Segmenter)
    return Array.from(
      new Segmenter(undefined, { granularity: "grapheme" }).segment(value),
      (s) => s.segment,
    );
  // Older WebViews: preserve marks, variation selectors, modifiers and ZWJ sequences.
  const out: string[] = [];
  let join = false;
  for (const c of Array.from(value)) {
    if (
      out.length &&
      (join ||
        c === "\u200d" ||
        /[\p{Mark}\uFE00-\uFE0F\u{1F3FB}-\u{1F3FF}]/u.test(c))
    )
      out[out.length - 1] += c;
    else out.push(c);
    join = c === "\u200d";
  }
  return out;
}
export function attributeCaption(name: string, level: number) {
  if (!/\p{Script=Han}/u.test(name)) return name;
  const chars = graphemes(name),
    limit = level >= 100 ? 2 : 4;
  return chars.length > limit
    ? chars.slice(0, level >= 100 ? 2 : 3).join("") + "…"
    : name;
}
export type TextBudget = {
  width: number;
  lines: number;
  fontSize: number;
  lineHeight: number;
  weight: number;
};
// Shared smallest normal card print slot; independent of the current handset.
export const cardTitleBudget: TextBudget = {
  width: 88,
  lines: 2,
  fontSize: 12,
  lineHeight: 1.2,
  weight: 700,
};
let probe: HTMLDivElement | undefined;
export function fitsTextBudget(text: string, budget: TextBudget) {
  if (typeof document === "undefined") return true;
  if (!probe) {
    probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    document.body.append(probe);
  }
  const font =
    getComputedStyle(document.documentElement).getPropertyValue("--font-ui") ||
    "system-ui,sans-serif";
  probe.style.cssText = `position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;contain:layout style;box-sizing:content-box;padding:0;border:0;margin:0;width:${budget.width}px;height:${budget.fontSize * budget.lineHeight * budget.lines}px;font:${budget.weight} ${budget.fontSize}px/${budget.lineHeight} ${font};white-space:normal;overflow-wrap:anywhere;word-break:normal;letter-spacing:normal;`;
  probe.textContent = text;
  const range = document.createRange();
  range.selectNodeContents(probe);
  const box = probe.getBoundingClientRect();
  return (
    probe.scrollWidth <= probe.clientWidth + 1 &&
    probe.scrollHeight <= probe.clientHeight + 1 &&
    Array.from(range.getClientRects()).every(
      (r) => r.right <= box.right + 0.5 && r.bottom <= box.bottom + 1,
    )
  );
}
export function checkCardPrintBudget(value: string, previous?: string) {
  if (value === previous) return;
  if (!fitsTextBudget(value, cardTitleBudget))
    throw Error(
      document.documentElement.lang === "en"
        ? "The name exceeds the two-line card title. Please shorten it."
        : "名称超出卡牌两行文字空间，请缩短名称",
    );
}
