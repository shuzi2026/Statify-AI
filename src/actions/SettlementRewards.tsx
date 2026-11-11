import { Check } from "lucide-react";
import { ExperienceReward, ValueReward } from "../ExperienceReward";
import {
  rules,
  statusNames,
  type Action,
  type Entry,
  type State,
} from "../model";
import { statusRules } from "../../shared/rules/status";
export function SettlementRewards({
  s,
  a,
  preview,
  rating,
}: {
  s: State;
  a: Action;
  preview: Entry | undefined;
  rating: number;
}) {
  const rewards = preview?.rewards.flatMap((reward) => {
    const attribute = s.attributes.find((item) => item.id === reward.id && item.slot >= 0);
    return attribute ? [{ reward, attribute }] : [];
  }) ?? [];
  const values = preview?.values.flatMap((reward) => {
    const meter = s.meters.find((item) => item.id === reward.id);
    return meter ? [{ reward, meter }] : [];
  }) ?? [];
  return (
    <>
      {" "}
      {preview && (
        <>
          <div className="settlement-orb">
            <Check size={34} />
          </div>
          {a.card.message && (
            <p className="completion-message">{a.card.message}</p>
          )}
          {rewards.length > 0 && (
            <div className="experience-rewards">
              {rewards.map(({ reward, attribute }) => (
                <ExperienceReward
                  key={reward.id}
                  attribute={attribute}
                  reward={reward}
                  dailyReached={
                    (attribute.daily[preview.date] || 0) + reward.actual >=
                    rules.dailyExperience
                  }
                />
              ))}
            </div>
          )}
          <div className="value-rewards">
            {preview.effects.map((r) => (
              <ValueReward
                key={r.id}
                reward={r}
                name={statusNames[r.id as keyof typeof statusNames] || r.name}
                min={statusRules.min}
                max={statusRules.max}
              />
            ))}
            {values.map(({ reward, meter }) => (
              <ValueReward
                key={reward.id}
                reward={reward}
                name={meter.name}
                min={meter.min}
                max={meter.max}
              />
            ))}
          </div>
        </>
      )}
      {preview && (
        <details className="settlement-calculation">
          <summary>查看计算明细</summary>
          <p>
            状态系数 ×{preview.coefficient.toFixed(2)} · 评价 ×{rating}
          </p>
          {rewards.map(({ reward: r }) => (
            <p key={r.id}>
              {r.name}：计算 {Math.round(r.requested)}，实际 +
              {Math.round(r.actual)}
              {r.reason ? " · " + r.reason : ""}
            </p>
          ))}
          <p>{preview.counted ? "计为完成一次" : "只记录本次投入"}</p>
        </details>
      )}
    </>
  );
}
