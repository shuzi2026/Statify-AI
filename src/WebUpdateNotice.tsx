import { useState, useSyncExternalStore } from "react";
import { webUpdates } from "./web-update";

export function WebUpdateNotice() {
  const status = useSyncExternalStore(
    webUpdates.subscribe,
    webUpdates.snapshot,
  );
  const [later, setLater] = useState(false);
  if (status === "unsupported") return null;
  const busy = status === "checking" || status === "downloading";
  return (
    <section className="web-update" aria-label="应用更新">
      <p className="help" role="status" aria-live="polite">
        {status === "checking"
          ? "正在检查更新…"
          : status === "downloading"
            ? "正在下载并验证更新…"
            : status === "ready"
              ? later
                ? "更新已就绪，稍后再提醒。"
                : "更新已下载。请先保存编辑并完成或暂停计时，关闭所有本应用页面后重新打开。"
              : status === "failed"
                ? "更新检查或下载失败，当前版本仍可使用。请联网后重试。"
                : status === "current"
                  ? "已是当前可用版本。"
                  : "检查并下载可用更新。"}
      </p>
      <div className="settings-options">
        <button
          disabled={busy}
          onClick={() => {
            setLater(false);
            void webUpdates.check();
          }}
        >
          检查更新
        </button>
        {status === "ready" && !later && (
          <button onClick={() => setLater(true)}>稍后提醒</button>
        )}
      </div>
    </section>
  );
}
