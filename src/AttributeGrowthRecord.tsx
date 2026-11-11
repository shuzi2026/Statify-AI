import { useState, type ReactNode } from "react";
import type { State } from "./model";
import { growth } from "./engine";
import { useRewardValue } from "./ExperienceReward";

/** A read-only replay of this attribute's existing daily experience ledger. */
export function AttributeGrowthRecord({
  attribute: a,
  day,
  controls,
}: {
  attribute: State["attributes"][number];
  day: string;
  controls: ReactNode;
}) {
  const gain = Math.max(0, Math.min(a.earned, a.daily[day] || 0));
  const [opening] = useState(() => ({
    day,
    initial: a.initial,
    after: a.earned,
    before: a.earned - gain,
  }));
  const animated = useRewardValue(opening.before, opening.after);
  // Changes from another tab or an attribute edit show current data without replaying the day again.
  const replay =
    opening.day === day &&
    opening.initial === a.initial &&
    opening.after === a.earned;
  const earned = replay ? animated : a.earned,
    g = growth({ ...a, earned }),
    full = g.level === 100,
    finished = !replay || animated === opening.after;
  const start = growth({ ...a, earned: Math.max(0, a.earned - gain) });
  return (
    <section
      className={
        "attribute-growth-record" + (gain > 0 ? " archive-has-growth" : "")
      }
      data-growth-phase={finished ? "complete" : "growing"}
      aria-label={a.name + "成长档案"}
    >
      <header>
        <span>
          {a.slot + 1} · {a.name}
        </span>
        <span>{controls}</span>
      </header>
      <div className="attribute-growth-values">
        <div className="archive-growth-level">
          <strong>Lv. {g.level}</strong>
          {gain > 0 && (
            <span
              className="archive-today-growth"
              title={
                "今日起点 Lv." +
                start.level +
                "，" +
                Math.round(start.progress) +
                " / " +
                start.next +
                " 经验"
              }
            >
              今日 +{Math.round(gain)}
            </span>
          )}
        </div>
        <span>
          {full
            ? "已达最高等级"
            : Math.round(g.progress) + " / " + g.next + " 经验"}
        </span>
      </div>
      <progress
        aria-label={a.name + "档案经验进度"}
        max={full ? 1 : g.next}
        value={full ? 1 : Math.min(g.next, g.progress)}
      />
      <div className="attribute-growth-detail">
        <small>累计成长经验 {Math.round(earned)}</small>
        <small>
          {full
            ? "经验继续累计"
            : "距下一级 " +
              Math.max(0, Math.ceil(g.next - g.progress)) +
              " 经验"}
        </small>
      </div>
    </section>
  );
}
