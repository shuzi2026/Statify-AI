import { confirmAction } from "../components";
import { registerSaveReplacement } from "../application/save-replacement";

/** Runtime-only inputs (including account forms) are not copied into storage.
 * Watch actual input surfaces; an open editing dialog also counts before typing,
 * e.g. dragging a plan card and still choosing its start time. */
export function connectReplacementInteraction() {
  const edited = new WeakSet<Element>();
  let revision = 0;
  const changed = () => {
    revision++;
  };
  const input = (event: Event) => {
    changed();
    if (
      event.target instanceof Element &&
      !event.target.closest("[data-save-replacement-ignore]") &&
      event.target.matches(
        "input:not([type=file]),textarea,select,[contenteditable=true]",
      )
    )
      edited.add(event.target);
  };
  document.addEventListener("input", input, true);
  document.addEventListener("change", input, true);
  document.addEventListener("pointerdown", changed, true);
  document.addEventListener("keydown", changed, true);
  let decision: Promise<boolean> | undefined;
  const stop = registerSaveReplacement(
    async ({ source, confirmed }) => {
      if (confirmed) return true;
      const pending =
        Array.from(document.querySelectorAll("input,textarea,select,[contenteditable=true]")).some((el) => edited.has(el)) || document.querySelector("dialog[open],[role=dialog]");
      if (source !== "import" && !pending) return true;
      if (decision) return false;
      decision = confirmAction(
        source === "refresh"
          ? "另一页面已替换存档。载入后将放弃本页未提交的输入；取消可暂时保留输入，但不能把旧输入保存到新存档。是否载入？"
          : "替换存档后将放弃当前未提交的输入（包括新卡草稿和正在选择的计划时间）。原存档会保留备份；取消会保留当前存档和输入。是否继续？",
      );
      try {
        return await decision;
      } finally {
        decision = undefined;
      }
    },
    () => revision,
  );
  return () => {
    stop();
    document.removeEventListener("input", input, true);
    document.removeEventListener("change", input, true);
    document.removeEventListener("pointerdown", changed, true);
    document.removeEventListener("keydown", changed, true);
  };
}
