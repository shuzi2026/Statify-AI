import { setLayoutStyle } from "./style-value";

/** Use the layout width, never a transformed/animated bounding rectangle. */
export function sizeLegacyCard(element: HTMLElement, measuredWidth?: number) {
  if (document.documentElement.dataset.statifyNoAspect !== "true") return;
  let width = measuredWidth;
  if (element.classList.contains("drawn-card-paper")) {
    const overlay = element.closest<HTMLElement>(".drawn-card-overlay");
    if (overlay) {
      // Mirror the shared card-system.css viewport budget. Legacy min() copies
      // keep one argument, which can otherwise make a tall phone's card too wide.
      const style = getComputedStyle(overlay),
        outsetX =
          parseFloat(style.getPropertyValue("--theme-card-outset-x-ratio")) ||
          0,
        outsetY =
          parseFloat(style.getPropertyValue("--theme-card-outset-y-ratio")) ||
          0;
      // The overlay fills the layout viewport. Its width and the resulting
      // paper height are known before showModal(), without measuring a hidden
      // dialog or flushing layout between two geometry writes.
      const availableWidth = innerWidth - 44,
        availableHeight = innerHeight - 220;
      width =
        Math.max(
          0,
          Math.min(
            292,
            availableWidth / (1 + 2 * outsetX),
            (availableHeight * 158) / 218 / (1 + 2 * outsetY),
          ),
        );
      setLayoutStyle(overlay, "--drawn-card-width", width + "px");
    }
  }
  width ??= element.offsetWidth;
  if (!width) return;
  const height = (width * 218) / 158 + "px";
  setLayoutStyle(element, "--sc-card-height", height);
}
