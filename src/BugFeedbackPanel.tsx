import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { compatibilityReport } from "./compatibility";
import { Dialog } from "./components";
import { runtimeIssues, subscribeRuntimeIssues } from "./runtime-diagnostics";
import { buildIdentity, workerIdentity } from "./build-identity";
import { paymentRegion } from "./payments/deployment";

const developerX = "https://x.com/GetStatifyApp";

export async function copyFeedback(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    /* Older WebViews can use the user-initiated selection fallback. */
  }
  const previous = document.activeElement as HTMLElement | null,
    input = document.createElement("textarea");
  input.value = text;
  input.readOnly = true;
  input.style.cssText = "position:fixed;left:-9999px;top:0";
  const dialogs = document.querySelectorAll("dialog[open]");
  (dialogs[dialogs.length - 1] || document.body).append(input);
  try {
    input.select();
    input.setSelectionRange(0, text.length);
    if (!document.execCommand("copy")) throw Error("Copy failed");
  } finally {
    input.remove();
    previous?.focus({ preventScroll: true });
  }
}
export function BugFeedbackPanel({ close }: { close: () => void }) {
  const issues = useSyncExternalStore(subscribeRuntimeIssues, runtimeIssues),
    [environment, Environment] = useState<unknown>(null),
    [worker, Worker] = useState<unknown>({ status: "checking" }),
    [copyState, CopyState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    let active = true;
    void workerIdentity()
      .then((value) => {
        if (active) Worker(value);
      })
      .catch(() => {
        if (active) Worker({ status: "unavailable" });
      });
    void compatibilityReport()
      .then((report) => {
        if (active) Environment(report);
      })
      .catch(() => {
        if (active) Environment({ nativeStatus: "unavailable" });
      });
    return () => {
      active = false;
    };
  }, []);
  const report = useMemo(
    () =>
      JSON.stringify(
        {
          ...(paymentRegion === "global"
            ? { developerContact: developerX }
            : { developerQQ: "3560981051" }),
          build: __STATIFY_BUILD_LABEL__,
          identity: buildIdentity,
          region: paymentRegion,
          worker,
          userAgent: navigator.userAgent,
          legacyEngine: document.documentElement.hasAttribute(
            "data-statify-legacy",
          ),
          animationFallback: !!(window as unknown as Record<string, unknown>)
            .statifyAnimatePatched,
          environment,
          errors: issues,
        },
        null,
        2,
      ),
    [environment, issues, worker],
  );
  return (
    <Dialog title="Bug 反馈" close={close} className="bug-feedback-dialog">
      <p>请复制反馈信息，连同问题截图发送给开发者。</p>
      <p className="bug-feedback-contact">
        {paymentRegion === "global" ? (
          <a href={developerX} target="_blank" rel="noopener noreferrer">
            X · @GetStatifyApp
          </a>
        ) : (
          <>
            开发者 QQ：<strong>3560981051</strong>
          </>
        )}
      </p>
      <label className="field">
        <span>反馈信息</span>
        <textarea
          className="bug-feedback-report"
          aria-label="反馈信息"
          readOnly
          rows={12}
          value={environment === null ? "正在读取设备信息…" : report}
        />
      </label>
      <p role="status">
        {copyState === "copied"
          ? "已复制反馈信息"
          : copyState === "failed"
            ? "复制失败，请长按选择反馈信息后复制。"
            : ""}
      </p>
      <footer className="dialog-actions">
        <button
          className="primary"
          disabled={environment === null}
          onClick={() => {
            void copyFeedback(report)
              .then(() => CopyState("copied"))
              .catch(() => CopyState("failed"));
          }}
        >
          复制反馈信息
        </button>
      </footer>
    </Dialog>
  );
}
