import { Capacitor } from "@capacitor/core";
/** Native hosts already consume insets. PWA safe-area values are applied once in CSS. */
export function initializeLayoutWindow() {
  const root = document.documentElement;
  root.dataset.nativeInsets = String(Capacitor.isNativePlatform());
  let frame = 0;
  const update = () => {
    frame = 0;
    const v = window.visualViewport;
    const zoomed = v && Math.abs(v.scale - 1) > 0.01;
    root.style.setProperty("--window-width", innerWidth + "px");
    root.style.setProperty("--window-height", innerHeight + "px");
    root.style.setProperty(
      "--visible-height",
      (!zoomed && v ? v.height : innerHeight) + "px",
    );
    root.style.setProperty(
      "--visible-top",
      (!zoomed && v ? v.offsetTop : 0) + "px",
    );
  };
  const request = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  };
  update();
  window.addEventListener("resize", request);
  window.addEventListener("statify:configuration", request);
  window.visualViewport?.addEventListener("resize", request);
  window.visualViewport?.addEventListener("scroll", request);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", request);
    window.removeEventListener("statify:configuration", request);
    window.visualViewport?.removeEventListener("resize", request);
    window.visualViewport?.removeEventListener("scroll", request);
  };
}
