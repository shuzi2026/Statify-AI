import { useEffect, useState } from "react";
import { type State, type Entry } from "./model";
import { growth } from "./engine";

export function useRewardValue(before: number, after: number) {
  const [earned, Earned] = useState(before);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const finish = () => {
      cancelAnimationFrame(frame);
      Earned(after);
    };
    if (media.matches || before === after) {
      finish();
      return;
    }
    Earned(before);
    let started: number | undefined;
    const tick = (at: number) => {
      started ??= at;
      const t = Math.min(1, (at - started) / 1250),
        eased = 1 - Math.pow(1 - t, 3);
      Earned(before + (after - before) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const changed = () => {
      if (media.matches) finish();
    };
    media.addEventListener("change", changed);
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener("change", changed);
    };
  }, [before, after]);
  return earned;
}
export function ExperienceReward({
  attribute,
  reward,
  dailyReached = false,
}: {
  dailyReached?: boolean;
  attribute: State["attributes"][number];
  reward: Entry["rewards"][number];
}) {
  const elapsed = useExperienceBeat(reward),
    before = growth({ ...attribute, earned: reward.before }),
    after = growth({ ...attribute, earned: reward.after });
  const phase =
      elapsed < 500
        ? "charge"
        : elapsed < 1100
          ? "impact"
          : elapsed < 1800
            ? "settle"
            : "complete",
    real = elapsed >= 1100;
  const capped = dailyReached || reward.reason.includes("每日上限"),
    actualPercent =
      after.level >= 100
        ? 100
        : Math.min(100, (after.progress / after.next) * 100);
  // The full bar is a reward beat only. Accessibility and saved data always use actual results.
  const percent =
    phase === "charge"
      ? 100 * (1 - Math.pow(1 - elapsed / 500, 3))
      : phase === "impact"
        ? 100
        : phase === "settle"
          ? 100 +
            (actualPercent - 100) *
              (1 - Math.pow(1 - (elapsed - 1100) / 700, 3))
          : actualPercent;
  const upgraded = after.level > before.level,
    current = real ? after : before;
  return (
    <section
      className={
        "experience-reward growth-reward " +
        (upgraded && real ? "is-level-up" : "") +
        (reward.actual === 0 ? " is-zero" : "")
      }
      data-phase={phase}
      aria-label={reward.name + "经验变化"}
      title={reward.reason}
    >
      <span
        className="reward-name"
        title={"Lv." + before.level + " → Lv." + after.level}
      >
        {reward.name}
        <small>
          Lv.{current.level}
          {upgraded && real && (
            <b className="experience-upgrade">
              {" "}
              升级 +{after.level - before.level}
            </b>
          )}
        </small>
      </span>
      <div
        className="experience-track"
        role="progressbar"
        aria-label={reward.name + "等级进度"}
        aria-valuemin={0}
        aria-valuemax={after.level >= 100 ? 100 : after.next}
        aria-valuenow={after.level >= 100 ? 100 : Math.round(after.progress)}
        aria-valuetext={
          "等级" +
          after.level +
          "，" +
          (after.level >= 100
            ? "已满级"
            : Math.round(after.progress) + " / " + after.next + "经验")
        }
      >
        <span
          className="experience-fill"
          aria-hidden="true"
          style={{ width: "100%", transform: "scaleX(" + percent / 100 + ")" }}
        />
        <span className="reward-position" aria-hidden={!real}>
          {after.level >= 100
            ? "已满级"
            : Math.round(after.progress) + " / " + after.next}
        </span>
      </div>
      <strong className="reward-delta" title="经验">
        +{Math.round(reward.actual)}
      </strong>
      {capped && <small className="experience-cap">已达今日可进步上限</small>}
      {reward.reason && <small className="sr-only">{reward.reason}</small>}
    </section>
  );
}

function useExperienceBeat(reward: Entry["rewards"][number]) {
  const [elapsed, Elapsed] = useState(() =>
    reward.actual <= 0 ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 1800
      : 0,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const finish = () => {
      cancelAnimationFrame(frame);
      Elapsed(1800);
    };
    if (media.matches || reward.actual <= 0) {
      finish();
      return;
    }
    Elapsed(0);
    const started = performance.now();
    const tick = (at: number) => {
      const value = Math.min(1800, Math.max(0, at - started));
      Elapsed(value);
      if (value < 1800) frame = requestAnimationFrame(tick);
    };
    const changed = () => {
        if (media.matches) finish();
      },
      hidden = () => {
        if (document.hidden) finish();
      };
    if (document.hidden) finish();
    else frame = requestAnimationFrame(tick);
    media.addEventListener("change", changed);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener("change", changed);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [reward.before, reward.after, reward.actual]);
  return elapsed;
}

export function ValueReward({
  reward,
  name,
  min,
  max,
}: {
  reward: Entry["effects"][number];
  name: string;
  min: number | null;
  max: number | null;
}) {
  const value = useRewardValue(reward.before, reward.after),
    bounded = min !== null && max !== null && max > min;
  const percent = bounded
    ? Math.max(0, Math.min(100, ((value - min!) / (max! - min!)) * 100))
    : reward.actual === 0
      ? 0
      : Math.min(100, Math.abs((value - reward.before) / reward.actual) * 100);
  return (
    <section
      className="experience-reward value-reward"
      aria-label={name + "数值变化"}
    >
      <span className="reward-name">{name}</span>
      <div
        className="experience-track"
        role="progressbar"
        aria-label={name + (bounded ? "数值进度" : "本次变化")}
        aria-valuemin={bounded ? min! : 0}
        aria-valuemax={bounded ? max! : Math.max(1, Math.abs(reward.actual))}
        aria-valuenow={
          bounded
            ? Math.max(min!, Math.min(max!, Math.round(value)))
            : Math.round(Math.abs(value - reward.before))
        }
        aria-valuetext={
          reward.before +
          " → " +
          Math.round(value) +
          (bounded ? "，范围" + min + "到" + max : "，本次变化")
        }
      >
        <span className="experience-fill" style={{ width: percent + "%" }} />
        <span className="reward-position">
          {reward.before} → {Math.round(value)}
        </span>
      </div>
      <strong className="reward-delta">
        {reward.actual >= 0 ? "+" : ""}
        {Math.round(reward.actual)}
      </strong>
      {reward.reason && (
        <small
          className={
            reward.reason.includes("两行数值空间不足")
              ? "meter-capacity-warning"
              : "sr-only"
          }
        >
          {reward.reason}
        </small>
      )}
    </section>
  );
}
