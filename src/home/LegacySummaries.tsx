import { ruleContext } from "../payments/access";
import { Activity, BookOpen, Brain, Sparkles, Sun, Target } from "lucide-react";
import { attrAllowed, coefficient, growth, statusValue } from "../engine";
import { type State } from "../model";

export function AttributeRow({
  s,
  a,
  now,
}: {
  s: State;
  a: State["attributes"][number];
  now: number;
}) {
  const g = growth(a),
    locked = !attrAllowed(s, a, ruleContext(now)),
    Icon = [Activity, Brain, BookOpen, Target, Sparkles, Sparkles][
      Math.max(0, a.slot)
    ];
  return (
    <div className={"attribute-row " + (locked ? "locked" : "")}>
      <span className="attribute-icon">
        <Icon size={20} />
      </span>
      <div>
        <div className="between">
          <strong>{a.name}</strong>
          <span>{locked ? "已锁定" : "Lv. " + g.level}</span>
        </div>
        <progress
          max={g.next}
          value={g.level >= 100 ? g.next : Math.min(g.progress, g.next)}
          aria-label={a.name + "成长进度"}
        />
        <small>
          {g.level === 100
            ? "100级 · 累计 " + Math.round(g.total) + " 经验"
            : Math.round(g.progress) + " / " + g.next + " 经验"}
        </small>
      </div>
    </div>
  );
}
export function StatusSummary({
  s,
  now,
  open,
}: {
  s: State;
  now: number;
  open: () => void;
}) {
  return (
    <button className="status-summary" onClick={open}>
      <span className="soft-disc">
        <Sun size={24} />
      </span>
      <span>
        <strong>此刻的状态</strong>
        <small>成长系数 ×{coefficient(s, now).toFixed(2)}</small>
      </span>
      <span className="status-dots">
        {[statusValue(s, "mood", now), statusValue(s, "vitality", now)].map(
          (n, i) => (
            <i key={i} style={{ opacity: 0.4 + n / 170 }} />
          ),
        )}
      </span>
      <span aria-hidden>›</span>
    </button>
  );
}
