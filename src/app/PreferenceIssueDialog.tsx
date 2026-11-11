import { useState, useSyncExternalStore } from "react";
import { Dialog } from "../components";
import {
  preferenceIssues,
  subscribePreferences,
  type PreferenceIssue,
} from "../local-data/preferences";

const names: Record<PreferenceIssue["key"], string> = {
  reducedEffects: "减少动态效果",
  cardFloating: "卡牌浮动",
  cardFloatingOverride: "卡牌浮动",
  cardLighting: "光影效果",
  planLayout: "计划分隔比例",
  theme: "主题",
};

const details: Record<PreferenceIssue["status"], string> = {
  unavailable: "暂时无法读取或保存。关闭弹窗后可以再试一次刚才的操作。若刚打开应用就看到提示，可以重新打开应用。",
  invalid: "现有设置无法使用。应用暂时使用默认设置，原设置仍保留。",
  ambiguous: "无法确认旧设置属于当前使用的应用。应用暂时使用默认设置，原设置仍保留。",
  "legacy-changed": "旧页面更改了这项设置。请关闭旧页面，再在当前页面重新选择。",
};

export function PreferenceIssueDialog({ available }: { available: boolean }) {
  const issues = useSyncExternalStore(subscribePreferences, preferenceIssues);
  const [dismissed, setDismissed] = useState<PreferenceIssue[]>([]);
  const pending = issues.filter((issue) => !dismissed.includes(issue));

  if (!available || !pending.length) return null;
  const title = pending.every(({ status }) => status === "invalid" || status === "ambiguous")
    ? "有些显示设置无法恢复"
    : "有些显示设置需要检查";
  const dismiss = () => setDismissed(issues);

  return (
    <Dialog title={title} close={dismiss} focusTitle>
      {(Object.keys(details) as PreferenceIssue["status"][]).map((status) => {
        const group = pending.filter((issue) => issue.status === status);
        if (!group.length) return null;
        return (
          <div key={status}>
            <ul>
              {[...new Set(group.map(({ key }) => names[key]))].map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            <p>{details[status]}</p>
          </div>
        );
      })}
      <p>你的卡牌和行动记录可以继续使用。</p>
      <footer className="dialog-actions single-action">
        <button className="primary" onClick={dismiss}>继续使用</button>
      </footer>
    </Dialog>
  );
}
