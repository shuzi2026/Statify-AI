import { useEffect, useRef, useState } from "react";
import { planRules } from "../../shared/rules/plans";
import { NumberInput } from "../inputs/ValueInputs";
import type { PlanBoard } from "./usePlanBoard";
export function PlanProgress({ board }: { board: PlanBoard }) {
  const { p, pr, upcoming, liveCycle, closed, update } = board;
  const progressView = (
    <div className="plan-progress-summary">
      {p.mode === "score" && p.cards.length > 0 && (
        <label className="plan-target">
          {upcoming ? "下周期计划目标积分" : "请输入计划达到的分数"}
          <PlanNumber
            label="计划目标积分"
            max={Math.max(
              1,
              p.cards.reduce(
                (v, r) =>
                  v + r.target * (r.score ?? planRules.defaultItemScore),
                0,
              ),
            )}
            value={p.target}
            disabled={closed}
            change={(target) =>
              update((x) => {
                x.target = target;
              })
            }
          />
          分
        </label>
      )}
      <div className="plan-progress-line">
        <progress
          max={pr.target || 1}
          value={pr.value}
          aria-label={p.name + "进度"}
        />
        <span>
          {upcoming ? "本期：" : ""}
          {pr.value} / {pr.target}
          {(liveCycle?.mode || p.mode) === "score" ? "分" : "次"}
        </span>
      </div>
      <p className="plan-mode-note">
        {"当前为" +
          (p.mode === "cards" ? "卡牌模式" : "积分模式") +
          "，达到当前有效计划目标后立即升级。"}
      </p>
    </div>
  );

  return progressView;
}
function PlanNumber({
  label,
  value,
  max,
  disabled,
  change,
}: {
  label: string;
  value: number;
  max: number;
  disabled: boolean;
  change: (n: number) => Promise<boolean>;
}) {
  const [text, Text] = useState(String(value)),
    focused = useRef(false);
  useEffect(() => {
    if (!focused.current) Text(String(value));
  }, [value]);
  return (
    <NumberInput
      style={{ width: Math.max(2, text.length) + "ch" }}
      aria-label={label}
      placeholder="--"
      min={planRules.minTarget}
      max={max}
      step="1"
      value={text}
      disabled={disabled}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => Text(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      onBlur={async () => {
        focused.current = false;
        const n = Number(text);
        if (!Number.isInteger(n) || n < 1 || n > max) {
          Text(String(value));
          return;
        }
        if (n !== value && !(await change(n))) Text(String(value));
      }}
    />
  );
}
