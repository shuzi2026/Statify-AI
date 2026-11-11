import { initializeSystemBars } from "./system-bars";
import { initializeLayoutWindow } from "./ui-layout/window";
import { applyNativeFontScale } from "./compatibility";
import { initializeFocusPresentation } from "./inputs/focus";

let launchPromise: Promise<void> | undefined;
/** Show usable colour layout immediately; images enhance independently. */
export function finishLaunch() {
  if (launchPromise) return launchPromise;
  try {
    performance.mark("statify:ready");
  } catch {
    /* Optional measurement. */
  }
  launchPromise = (async () => {
    document.documentElement.removeAttribute("data-starting");
    const screen = document.getElementById("launch-screen");
    screen?.classList.add("is-ready");
    screen?.setAttribute("aria-hidden", "true");
    screen?.addEventListener("transitionend", () => screen.remove(), {
      once: true,
    });
    // A cached launch can finish before the first paint, so transitionend is not guaranteed.
    if (screen) setTimeout(() => screen.remove(), 400);
    if (matchMedia("(prefers-reduced-motion:reduce)").matches) screen?.remove();
  })();
  return launchPromise;
}

/** The native host calls this on committed system Back, including OEM gestures and three-button navigation. */
export function handleSystemBack(): boolean {
  const popovers = [
    ...document.querySelectorAll<HTMLElement>("[popover]"),
  ].filter(
    (el) =>
      el.dataset.pickerOpen === "true" ||
      (typeof el.hidePopover === "function" && el.matches(":popover-open")),
  );
  if (popovers.length) {
    const top = popovers[popovers.length - 1];
    if (top.dataset.pickerOpen === "true")
      top.dispatchEvent(new Event("statify-picker-close"));
    else top.hidePopover();
    return true;
  }
  const escape = new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  });
  (document.activeElement || document).dispatchEvent(escape);
  if (escape.defaultPrevented) return true;
  const dialogs = document.querySelectorAll<HTMLDialogElement>("dialog[open]"),
    top =
      document.activeElement?.closest<HTMLDialogElement>("dialog[open]") ||
      dialogs[dialogs.length - 1];
  if (top) {
    if (top.dataset.backRoot === "true") return false;
    top.dispatchEvent(new Event("cancel", { cancelable: true }));
    return true;
  }
  const event = new Event("statify:navigate-back", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

/** Move only an obscured field; leave already-visible inputs in place. */
export function initializeMobileRuntime() {
  const disposeWindow = initializeLayoutWindow(),
    disposeFocus = initializeFocusPresentation(),
    disposeBars = initializeSystemBars();
  let disposed = false,
    fontEpoch = 0;
  const refreshFont = () => {
    const request = ++fontEpoch;
    void applyNativeFontScale(() => !disposed && request === fontEpoch);
  };
  refreshFont();
  window.addEventListener("statify:configuration", refreshFont);
  const preview = (event: MessageEvent) => {
    if (
      import.meta.env.DEV &&
      event.source === window.parent &&
      window.parent !== window &&
      event.origin === location.origin &&
      event.data?.type === "statify-white-model"
    )
      document.documentElement.dataset.whiteModel = String(
        event.data.enabled === true,
      );
  };
  window.addEventListener("message", preview);
  // Enter used to confirm Chinese/Japanese composition must never submit a form.
  const composing = new WeakSet<EventTarget>();
  const compositionStart = (event: CompositionEvent) => {
    if (event.target) composing.add(event.target);
  };
  const compositionEnd = (event: CompositionEvent) => {
    if (event.target) composing.delete(event.target);
  };
  const compositionKey = (event: KeyboardEvent) => {
    if (
      event.key === "Enter" &&
      (event.isComposing ||
        event.keyCode === 229 ||
        (event.target && composing.has(event.target)))
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  document.addEventListener("compositionstart", compositionStart, true);
  document.addEventListener("compositionend", compositionEnd, true);
  document.addEventListener("keydown", compositionKey, true);
  const viewport = window.visualViewport;
  let frame = 0,
    baseline = window.innerHeight,
    orientation = window.innerWidth;
  const adjusted = new Map<
    HTMLElement,
    { translate: string; maxHeight: string; overflowY: string }
  >();
  function clear() {
    for (const [el, style] of adjusted) {
      Object.assign(el.style, style);
      delete el.dataset.keyboardAdjusted;
    }
    adjusted.clear();
  }
  function fit() {
    frame = 0;
    clear();
    if (Math.abs(window.innerWidth - orientation) > 100) {
      orientation = window.innerWidth;
      baseline = window.innerHeight;
    }
    baseline = Math.max(baseline, window.innerHeight);
    const height = viewport?.height || window.innerHeight,
      top = viewport?.offsetTop || 0,
      bottom = top + height;
    const field = document.activeElement;
    document.documentElement.dataset.imeVisible = String(
      baseline - height >= 100 &&
        field instanceof HTMLElement &&
        field.matches(
          "input:not([inputmode=none]),textarea,[contenteditable=true]",
        ),
    );
    if (
      !(field instanceof HTMLElement) ||
      !field.matches(
        "input:not([type=range]):not([readonly]),textarea,[contenteditable=true]",
      ) ||
      (viewport && viewport.scale !== 1)
    )
      return;
    if (baseline - height < 100) return;
    let box = field.getBoundingClientRect();
    if (box.top >= top + 12 && box.bottom <= bottom - 12) return;
    const dialog = field.closest<HTMLElement>("dialog");
    // Registered shells already follow visualViewport through dialog-contract.css.
    // A second max-height/translate owner makes their paper jump as the IME animates.
    if (dialog && !dialog.hasAttribute("data-layout-shell")) {
      adjusted.set(dialog, {
        translate: dialog.style.translate,
        maxHeight: dialog.style.maxHeight,
        overflowY: dialog.style.overflowY,
      });
      dialog.dataset.keyboardAdjusted = "true";
      dialog.style.maxHeight = Math.max(100, height - 24) + "px";
      dialog.style.overflowY = "auto";
      const rect = dialog.getBoundingClientRect(),
        shift = Math.max(
          top + 12 - rect.top,
          Math.min(0, bottom - 12 - rect.bottom),
        );
      dialog.style.translate = `0 ${shift}px`;
    }
    // Scroll the closest available container by only the missing distance.
    for (
      let parent = field.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      box = field.getBoundingClientRect();
      const area = parent.getBoundingClientRect(),
        low = Math.min(bottom - 12, area.bottom),
        high = Math.max(top + 12, area.top);
      if (
        parent.scrollHeight > parent.clientHeight &&
        /(auto|scroll)/.test(getComputedStyle(parent).overflowY)
      ) {
        if (box.bottom > low) parent.scrollTop += box.bottom - low;
        else if (box.top < high) parent.scrollTop -= high - box.top;
      }
      if (parent === dialog) break;
    }
  }
  const request = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fit);
  };
  const back = handleSystemBack;
  (window as Window & { statifySystemBack?: () => boolean }).statifySystemBack =
    back;
  viewport?.addEventListener("resize", request);
  viewport?.addEventListener("scroll", request);
  window.addEventListener("resize", request);
  document.addEventListener("focusin", request);
  document.addEventListener("focusout", request);
  return () => {
    disposed = true;
    disposeWindow();
    disposeBars();
    disposeFocus();
    window.removeEventListener("statify:configuration", refreshFont);
    window.removeEventListener("message", preview);
    document.removeEventListener("compositionstart", compositionStart, true);
    document.removeEventListener("compositionend", compositionEnd, true);
    document.removeEventListener("keydown", compositionKey, true);
    cancelAnimationFrame(frame);
    clear();
    delete (window as Window & { statifySystemBack?: () => boolean })
      .statifySystemBack;
    viewport?.removeEventListener("resize", request);
    viewport?.removeEventListener("scroll", request);
    window.removeEventListener("resize", request);
    document.removeEventListener("focusin", request);
    document.removeEventListener("focusout", request);
  };
}
