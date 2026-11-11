/** Focus is preserved for dialogs and assistive technology. Only its presentation
 * follows the last deliberate input method, including programmatic focus return. */
export function initializeFocusPresentation() {
  const root = document.documentElement;
  root.dataset.inputMethod = "pointer";
  const pointer = () => {
    root.dataset.inputMethod = "pointer";
  };
  const keyboard = (event: KeyboardEvent) => {
    if (
      event.isComposing ||
      event.keyCode === 229 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    // Space, arrows and the IME confirm key inside an editor are text editing,
    // not a request to switch the whole app to keyboard-navigation decoration.
    if (
      event.key !== "Tab" &&
      event.target instanceof Element &&
      event.target.closest("input,textarea,[contenteditable=true]")
    )
      return;
    if (
      [
        "Tab",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
        "PageUp",
        "PageDown",
        "Enter",
        " ",
      ].includes(event.key)
    )
      root.dataset.inputMethod = "keyboard";
  };
  document.addEventListener("pointerdown", pointer, true);
  document.addEventListener("keydown", keyboard, true);
  return () => {
    document.removeEventListener("pointerdown", pointer, true);
    document.removeEventListener("keydown", keyboard, true);
    delete root.dataset.inputMethod;
  };
}
