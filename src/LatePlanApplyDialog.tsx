import { useState } from "react";
import { Dialog } from "./components";
import { allPlanPeriods, type PlanApplyChoice } from "./late-plan-edits";
import "./late-plan-edits.css";
export function LatePlanApplyDialog({
  answer,
}: {
  answer: (choice: PlanApplyChoice | null) => void;
}) {
  const [choice, Choice] = useState<PlanApplyChoice>({
    day: true,
    week: true,
    month: true,
  });
  return (
    <Dialog
      title="应用到当前周期？"
      close={() => answer(null)}
      focusTitle
      className="late-plan-dialog"
    >
      <p>
        选择现在生效的周期，
        <br />
        未选的从下个周期开始。
      </p>
      <div className="late-plan-options">
        {allPlanPeriods.map((p) => (
          <label key={p}>
            <input
              type="checkbox"
              checked={choice[p]}
              onChange={(e) =>
                Choice({ ...choice, [p]: e.currentTarget.checked })
              }
            />
            <span>{{ day: "本日", week: "本周", month: "本月" }[p]}</span>
          </label>
        ))}
      </div>
      <footer className="dialog-actions">
        <button onClick={() => answer(null)}>返回修改</button>
        <button className="primary" onClick={() => answer(choice)}>
          保存调整
        </button>
      </footer>
      <small className="creation-footer-note">
        接下来30分钟内，调整计划将沿用这次选择。
      </small>
    </Dialog>
  );
}
