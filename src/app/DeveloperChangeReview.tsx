import { useEffect, useState } from "react";
import { AI_CHAT_DEVELOPER_PATH, type DeveloperReview } from "../../shared/ai-chat";

const kinds = { added: "新增", modified: "修改", deleted: "删除" };
const errors: Record<string, string> = {
  review_stale: "工作区改动已更新，请刷新差异后重新选择。",
  review_conflict: "主项目文件与工作区基线不同。请处理冲突后重新审查。",
  review_busy: "正在应用另一批改动，请稍后重试。",
  developer_busy: "OpenCode 正在处理任务，请完成后再审查。",
};

export function DeveloperChangeReview({ token, onLocked }: { token: string; onLocked: () => void }) {
  const [review, setReview] = useState<DeveloperReview>();
  const [selected, setSelected] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(0);
  const [baselineWarning, setBaselineWarning] = useState(false);

  async function request(body: object, signal?: AbortSignal) {
    const response = await fetch(AI_CHAT_DEVELOPER_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(body),
      signal,
    });
    const result = await response.json();
    if (!response.ok) {
      if (result.error === "developer_locked") onLocked();
      throw new Error([errors[result.error] ?? "无法处理工作区改动，请重试。", result.path].filter(Boolean).join(" "));
    }
    return result;
  }

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setSelected([]);
    // Defer the request so StrictMode's first effect cleanup does not queue a second review on the server.
    const timer = window.setTimeout(() => {
      request({ action: "review" }, controller.signal)
        .then((result: DeveloperReview) => setReview(result))
        .catch((failure: Error) => {
          if (!controller.signal.aborted) {
            setReview(undefined);
            setError(failure.message);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [token, revision]);

  async function apply() {
    if (!review || !selected.length || busy) return;
    setBusy(true);
    setError("");
    setApplied(0);
    try {
      const result = await request({ action: "apply", review: review.id, paths: selected });
      setApplied(result.applied.length);
      setBaselineWarning(!result.baselineUpdated);
      setRevision((value) => value + 1);
    } catch (failure) {
      setSelected([]);
      setReview(undefined);
      setError(failure instanceof Error ? failure.message : "无法处理工作区改动，请重试。");
      setBusy(false);
    }
  }

  const selectablePaths = review?.files.filter((file) => file.state === "ready").map((file) => file.path) ?? [];
  const selectedCount = selectablePaths.filter((path) => selected.includes(path)).length;
  const allSelected = selectablePaths.length > 0 && selectedCount === selectablePaths.length;

  return (
    <>
      <section className="ai-chat-log ai-review" aria-labelledby="ai-review-title" tabIndex={0}>
        <h2 id="ai-review-title">审查工作区改动</h2>
        <p>展开文件查看差异，勾选后可应用到主项目。</p>
        {!!review?.files.length && (
          <label className="ai-review-file-heading">
            <input
              type="checkbox"
              disabled={busy || selectablePaths.length === 0}
              checked={allSelected}
              ref={(node) => {
                if (node) node.indeterminate = selectedCount > 0 && !allSelected;
              }}
              onChange={(event) => setSelected(event.target.checked ? selectablePaths : [])}
            />
            <span>全选当前可应用文件</span>
            <span>{selectedCount} / {selectablePaths.length}</span>
          </label>
        )}
        {busy && <p role="status">正在处理工作区改动…</p>}
        {applied > 0 && <p role="status">{"已应用文件"} {applied}</p>}
        {baselineWarning && <p role="alert">主项目已更新，工作区基线未能更新。</p>}
        {error && <p role="alert">{error}</p>}
        {!busy && review?.files.length === 0 && <p>没有待应用的改动。</p>}
        {review?.files.map((file) => (
          <div className="ai-review-file" key={file.path}>
            <div className="ai-review-file-heading">
              <label>
                <input type="checkbox" disabled={busy || file.state !== "ready"}
                  checked={selected.includes(file.path)}
                  onChange={(event) => setSelected(event.target.checked
                    ? [...selected, file.path] : selected.filter((path) => path !== file.path))} />
                <code>{file.path}</code>
              </label>
              <span>{kinds[file.kind]}</span>
            </div>
            {file.state === "conflict" && <p>主项目有不同改动，需手动处理。</p>}
            {file.state === "unsupported" && <p>此文件无法完整预览，需手动处理。</p>}
            {file.diff && (
              <details>
                <summary>查看差异</summary>
                <pre>{file.diff.split("\n").map((line, index) => (
                  <span key={index} className={line.startsWith("+") ? "ai-diff-added"
                    : line.startsWith("-") ? "ai-diff-removed" : undefined}>{line + "\n"}</span>
                ))}</pre>
              </details>
            )}
          </div>
        ))}
        {!!review?.omitted && <p>{"还有改动未列出"} {review.omitted}</p>}
      </section>
      <div className="ai-review-actions">
        <button type="button" disabled={busy} onClick={() => {
          setApplied(0);
          setBaselineWarning(false);
          setRevision((value) => value + 1);
        }}>刷新差异</button>
        <button type="button" disabled={busy || !selected.length} onClick={() => void apply()}>
          {"应用所选到主项目"}{selected.length > 0 && " (" + selected.length + ")"}
        </button>
      </div>
    </>
  );
}
