import { Component, useState, type ReactNode } from "react";
import { recordRuntimeIssue, runtimeIssues } from "./runtime-diagnostics";
import { buildIdentity, workerIdentity } from "./build-identity";
import { finishLaunch } from "./mobile-runtime";

function RecoveryScreen() {
  const [status, setStatus] = useState("");
  const [details, setDetails] = useState("");
  return (
    <main className="boot">
      <h1>界面暂时无法显示</h1>
      <p role="alert">
        现有存档仍保留。请先导出原始存档和诊断，再尝试重新打开。
      </p>
      <button
        onClick={() => {
          void import("./storage")
            .then(async ({ recoveryBackup, download }) => {
              await download(await recoveryBackup(), "Statify-原始存档.json");
            })
            .catch(() =>
              setStatus("原始存档暂时无法导出，请保留此页面并稍后重试。"),
            );
        }}
      >
        导出原始存档
      </button>
      <button
        onClick={() => {
          void workerIdentity().then((worker) =>
            setDetails(
              JSON.stringify(
                { build: buildIdentity, worker, errors: runtimeIssues() },
                null,
                2,
              ),
            ),
          );
        }}
      >
        显示诊断信息
      </button>
      {details && (
        <textarea aria-label="诊断信息" readOnly value={details} rows={10} />
      )}
      <p role="status">{status}</p>
      <button onClick={() => location.reload()}>重新打开</button>
    </main>
  );
}
export class AppErrorBoundary extends Component<
  { children: ReactNode; onFatal?: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    recordRuntimeIssue("render", error);
    this.props.onFatal?.();
    void finishLaunch().catch(() => {});
  }
  render() {
    return this.state.failed ? <RecoveryScreen /> : this.props.children;
  }
}
