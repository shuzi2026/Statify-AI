// Default fields use UTF-16 length as HTML maxLength.
import { textLimits } from "../shared/rules/text";
export { textLimits } from "../shared/rules/text";
// Estimate display width where layout hints or a font-measurement fallback need it.
export function cardNameWidth(value: string) {
  return Array.from(value).reduce(
    (size, c) =>
      size +
      (/^\p{Mark}$/u.test(c)
        ? 0
        : /^[\x20-\x7e]$/.test(c)
          ? /[MWmw@%&]/.test(c)
            ? 1
            : /[A-Z]/.test(c)
              ? 0.75
              : 0.5
          : /^\p{Script=Latin}$/u.test(c)
            ? c === c.toUpperCase()
              ? 0.75
              : 0.5
            : 1),
    0,
  );
}
/** Attribute creation uses print width; the eight-unit budget is not eight Latin letters. */
export function attributeNameWidth(value: string) {
  if (
    typeof document !== "undefined" &&
    typeof document.createElement === "function"
  ) {
    const context = document.createElement("canvas").getContext("2d");
    if (context) {
      context.font =
        "16px " +
        (getComputedStyle(document.documentElement).getPropertyValue(
          "--font-ui",
        ) || "sans-serif");
      const unit = context.measureText(String.fromCodePoint(0x6c49)).width;
      if (unit > 0) return context.measureText(value).width / unit;
    }
  }
  return cardNameWidth(value);
}
export function checkAttributeName(value: string) {
  if (
    value.length > 64 ||
    attributeNameWidth(value) > textLimits.attributeName + 0.01
  )
    throw Error("属性名称最多8个宽字符，英文按字宽折算");
}
export function checkTextLength(
  value: string,
  limit: number,
  label: string,
  previous?: string,
) {
  if (value !== previous && value.length > limit)
    throw Error(`${label}最多${limit}个字符`);
}
