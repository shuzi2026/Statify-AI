import { useState } from "react";
import {
  planRules,
  validPlanUses,
  validPlanScore,
} from "../../shared/rules/plans";
import { Dialog, Field } from "../components";
import { NumberInput } from "../inputs/ValueInputs";
import type { Card, Plan } from "../model";
export function PlanCardEditor({
  card,
  mode,
  target,
  score,
  error,
  close,
  save,
}: {
  card: Card;
  mode: Plan["mode"];
  target: number;
  score?: number;
  error: string;
  close: () => void;
  save: (target: number, score?: number) => Promise<void>;
}) {
  const [count, Count] = useState(String(target)),
    [points, Points] = useState(score === undefined ? "" : String(score)),
    [localError, Error] = useState(""),
    [busy, Busy] = useState(false);
  return (
    <Dialog
      title="修改计划卡牌"
      close={close}
      dismissible={!busy}
      className="plan-card-editor"
    >
      <p className="plan-edit-name">{card.name}</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const n = Number(count),
            s = mode === "score" ? Number(points) : undefined;
          if (!count.trim() || !validPlanUses(n)) {
            Error(
              "计划次数须为{min}到{max}的整数"
                .replace("{min}", String(planRules.minUses))
                .replace("{max}", String(planRules.maxUses)),
            );
            return;
          }
          if (mode === "score" && (!points.trim() || !validPlanScore(s))) {
            Error(
              "请填写{min}到{max}的每次积分"
                .replace("{min}", String(planRules.minScore))
                .replace("{max}", String(planRules.maxScore)),
            );
            return;
          }
          Error("");
          Busy(true);
          try {
            await save(n, s);
          } finally {
            Busy(false);
          }
        }}
      >
        <Field label="计划次数">
          <NumberInput
            aria-label="计划次数"
            min={planRules.minUses}
            max={planRules.maxUses}
            step="1"
            required
            autoFocus
            value={count}
            disabled={busy}
            onChange={(e) => Count(e.target.value)}
          />
        </Field>
        {mode === "score" && (
          <Field
            label="每次积分"
            hint={"{min}–{max}分"
              .replace("{min}", String(planRules.minScore))
              .replace("{max}", String(planRules.maxScore))}
          >
            <NumberInput
              aria-label="每次积分"
              min={planRules.minScore}
              max={planRules.maxScore}
              step="1"
              required
              value={points}
              disabled={busy}
              onChange={(e) => Points(e.target.value)}
            />
          </Field>
        )}
        {(error || localError) && <p role="alert">{error || localError}</p>}
        <footer className="dialog-actions">
          <button type="button" disabled={busy} onClick={close}>
            取消
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "正在保存…" : "OK！"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
