import { useSyncExternalStore } from "react";

function snapshot() {
  return (
    !document.hidden &&
    !matchMedia("(prefers-reduced-motion:reduce)").matches &&
    document.documentElement.dataset.reduceEffects !== "true"
  );
}
function subscribe(changed: () => void) {
  const media = matchMedia("(prefers-reduced-motion:reduce)");
  if (media.addEventListener) media.addEventListener("change", changed);
  else media.addListener(changed);
  const observer = new MutationObserver(changed);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-reduce-effects"],
  });
  document.addEventListener("visibilitychange", changed);
  return () => {
    if (media.removeEventListener) media.removeEventListener("change", changed);
    else media.removeListener(changed);
    observer.disconnect();
    document.removeEventListener("visibilitychange", changed);
  };
}
/** Cancel live demonstrations immediately when the OS/app opts out or hides. */
export function useMotionAllowed() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
