import { DateInput, NumberInput, TimeInput } from "./inputs/ValueInputs";
import { DialogContent } from "./ui-layout/DialogContent";
import { Leaf, Moon, X } from "lucide-react";
import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useLayoutEffect,
  useRef,
} from "react";
import { ThemeArtwork } from "./themes/ThemeArtwork";
import { currentDraftEpoch } from "./local-data/draft-epoch";
import { subscribeSave } from "./save-publication";

export function Dialog({
  title,
  children,
  close,
  wide = false,
  dismissible = true,
  hideTitle = false,
  className = "",
  blankDismiss = false,
  outsideDismiss = true,
  focusTitle = false,
  scrollHeading = false,
  back,
  backRoot = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
  dismissible?: boolean;
  hideTitle?: boolean;
  className?: string;
  blankDismiss?: boolean;
  outsideDismiss?: boolean;
  focusTitle?: boolean;
  scrollHeading?: boolean;
  back?: () => void;
  backRoot?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    el?.showModal();
    if (focusTitle)
      el?.querySelector<HTMLElement>(".dialog-heading h2")?.focus({
        preventScroll: true,
      });
    return () => el?.close();
  }, [focusTitle]);
  const heading = (
    <header className="dialog-heading">
      {!hideTitle && (
        <h2 tabIndex={focusTitle || scrollHeading ? -1 : undefined}>{title}</h2>
      )}
      {dismissible && (
        <button
          type="button"
          className="icon-button"
          aria-label="关闭窗口"
          onClick={close}
        >
          <X size={21} />
        </button>
      )}
    </header>
  );
  return (
    <dialog
      ref={ref}
      data-back-root={backRoot || undefined}
      aria-label={title}
      data-layout-shell={
        className.includes("focus-session") ? undefined : "fixed"
      }
      className={(wide ? "dialog wide" : "dialog") + " " + className}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !dismissible && !back && !backRoot) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        if (back) back();
        else if (dismissible) close();
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget || !dismissible || !outsideDismiss) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (
          blankDismiss ||
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          close();
      }}
    >
      {!scrollHeading && heading}
      {className.includes("focus-session") ? (
        children
      ) : (
        <DialogContent scrollPreamble={scrollHeading}>
          {scrollHeading && heading}
          {children}
        </DialogContent>
      )}
      {!className.includes("focus-session") && (
        <span className="dialog-paper" aria-hidden="true" />
      )}
    </dialog>
  );
}
const openDecisions = new Set<HTMLDialogElement>();
function updateDecisionPaint() {
  const front = [...openDecisions].at(-1);
  document.documentElement.toggleAttribute("data-decision-open", !!front);
  for (const dialog of openDecisions)
    dialog.toggleAttribute("data-decision-front", dialog === front);
}
function decision(
  message: string,
  notice = false,
  heading?: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog"),
      header = document.createElement("header"),
      title = document.createElement("h2"),
      body = document.createElement("p"),
      actions = document.createElement("footer"),
      paper = document.createElement("span");
    const previous = document.activeElement as HTMLElement | null;
    const epoch = currentDraftEpoch();
    let settled = false;
    let stop: (() => void) | undefined;
    dialog.className = "dialog themed-confirmation";
    paper.className = "dialog-paper";
    paper.setAttribute("aria-hidden", "true");
    header.className = "dialog-heading";
    title.textContent = heading ?? (notice ? "提示" : "请确认");
    title.id = "decision-" + crypto.randomUUID();
    dialog.setAttribute("aria-labelledby", title.id);
    body.textContent = message;
    actions.className = "dialog-actions";
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      stop?.();
      dialog.close();
      dialog.remove();
      openDecisions.delete(dialog);
      updateDecisionPaint();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
      resolve(value);
    };
    if (!notice) {
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "取消";
      cancel.onclick = () => finish(false);
      actions.append(cancel);
    }
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "primary";
    ok.textContent = notice ? "知道了" : "确认";
    ok.onclick = () => finish(true);
    actions.append(ok);
    header.append(title);
    dialog.append(header, body, actions);
    dialog.dataset.layoutShell = "fixed";
    const scroll = document.createElement("div"),
      footer = document.createElement("div");
    scroll.className = "dialog-scroll";
    footer.className = "dialog-fixed-footer";
    scroll.append(body);
    footer.append(actions);
    dialog.append(scroll, footer, paper);
    dialog.oncancel = (e) => {
      e.preventDefault();
      finish(false);
    };
    document.body.append(dialog);
    dialog.showModal();
    openDecisions.add(dialog);
    updateDecisionPaint();
    stop = subscribeSave(() => { if (currentDraftEpoch() !== epoch) finish(false); });
  });
}
export const confirmAction = (message: string, title?: string) =>
  decision(message, false, title);
export const showNotice = (message: string) => decision(message, true);
export function Field({
  label,
  children,
  hint,
  inlineHint = false,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  inlineHint?: boolean;
}) {
  return (
    <label className="field">
      <span className={inlineHint ? "field-label-line" : undefined}>
        {label}
        {inlineHint && hint && <small>{hint}</small>}
      </span>
      {Children.map(children, (child) => {
        if (
          isValidElement(child) &&
          ((typeof child.type === "string" &&
            ["input", "select", "textarea"].includes(child.type)) ||
            child.type === NumberInput ||
            child.type === TimeInput ||
            child.type === DateInput)
        ) {
          const field = child as ReactElement<{ "aria-label"?: string }>;
          return cloneElement(field, {
            "aria-label": field.props["aria-label"] ?? label,
          });
        }
        return child;
      })}
      {hint && !inlineHint && <small>{hint}</small>}
    </label>
  );
}
export function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <ThemeArtwork name="sleeping" className="empty-companion" />
      <Leaf size={32} />
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}
export const timeText = (seconds: number) => {
  const n = Math.floor(seconds);
  return (
    (Math.floor(n / 3600) > 0
      ? String(Math.floor(n / 3600)).padStart(2, "0") + ":"
      : "") +
    String(Math.floor(n / 60) % 60).padStart(2, "0") +
    ":" +
    String(n % 60).padStart(2, "0")
  );
};
export const SmallMoon = Moon;
