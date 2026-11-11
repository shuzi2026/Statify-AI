/** Decorative animation must never prevent the final interactive state. */
export function animateSafely(
  element: Element,
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  options: KeyframeAnimationOptions,
): Animation | null {
  try {
    return typeof element.animate === "function"
      ? element.animate(keyframes, options)
      : null;
  } catch {
    return null;
  }
}
