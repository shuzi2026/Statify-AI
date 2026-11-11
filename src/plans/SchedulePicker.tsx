import { useState, useRef } from "react";
import { planRules, validPlanScore } from "../../shared/rules/plans";
import { ActionCardFace } from "../cards/CardAppearance";
import { Dialog, Field } from "../components";
import { NumberInput, PickerWheel as Wheel } from "../inputs/ValueInputs";
import type { Card, Plan } from "../model";
import { planBounds, planDate } from "../planning";

export function SchedulePicker({
  p,
  card,
  slotId,
  externalError,
  now,
  close,
  save,
}: {
  p: Plan;
  card: Card;
  slotId?: string;
  externalError: string;
  now: number;
  close: () => void;
  save: (day: string, time: string, score?: number) => Promise<void>;
}) {
  const slot = p.slots?.find((x) => x.id === slotId),
    b = planBounds(p, now),
    days: { value: string; label: string }[] = [];
  if (p.scope === "once") {
    for (let d = b.start; d < b.end;) {
      days.push({
        value: planDate(d),
        label: planDate(d).slice(5).replace("-", " / "),
      });
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      d = next.getTime();
    }
  } else {
    const n = p.period === "week" ? 7 : p.period === "month" ? 31 : 1;
    for (let i = 1; i <= n; i++)
      days.push({
        value: String(i),
        label:
          p.period === "week"
            ? ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][i - 1]
            : p.period === "month"
              ? `${i}日`
              : "本日",
      });
  }
  if (p.period !== "day") days.unshift({ value: "", label: "--" });
  const defaultDay = p.period !== "day" ? "" : days[0].value;
  const [points, Points] = useState(
    slot?.configured === false
      ? ""
      : String(p.cards.find((r) => r.id === card.id)?.score ?? card.score),
  );
  const [day, Day] = useState(
      slot?.configured === false ? defaultDay : (slot?.day ?? defaultDay),
    ),
    [hour, Hour] = useState(slot?.time.slice(0, 2) || ""),
    [minute, Minute] = useState(slot?.time.slice(3) || ""),
    [error, E] = useState(""),
    [busy, Busy] = useState(false),
    readDay = useRef<(() => string) | null>(null),
    readHour = useRef<(() => string) | null>(null),
    readMinute = useRef<(() => string) | null>(null);
  return (
    <Dialog
      title="安排时间"
      hideTitle
      className="plan-schedule-dialog"
      dismissible={!busy}
      close={close}
    >
      <div className="plan-schedule-card gallery-card-paper">
        <ActionCardFace card={card} />
      </div>
      <div className="plan-wheels">
        <Wheel
          label="日期"
          options={days}
          value={day}
          change={Day}
          read={readDay}
        />
        <Wheel
          label="小时"
          options={[
            { value: "", label: "--" },
            ...Array.from({ length: 24 }, (_, i) => ({
              value: String(i).padStart(2, "0"),
              label: String(i).padStart(2, "0"),
            })),
          ]}
          value={hour}
          change={(v) => {
            Hour(v);
            if (v && !minute) Minute("00");
            if (!v) Minute("");
          }}
          read={readHour}
        />
        <span className="plan-wheel-colon">:</span>
        <Wheel
          label="分钟"
          options={[
            { value: "", label: "--" },
            ...Array.from({ length: 60 }, (_, i) => ({
              value: String(i).padStart(2, "0"),
              label: String(i).padStart(2, "0"),
            })),
          ]}
          value={minute}
          change={(v) => {
            Minute(v);
            if (v && !hour) Hour("00");
            if (!v) Hour("");
          }}
          read={readMinute}
        />
      </div>
      {p.mode === "score" && (
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
      {(error || externalError) && <p role="alert">{error || externalError}</p>}
      <footer className="dialog-actions">
        <button disabled={busy} onClick={close}>
          取消
        </button>
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            const d = readDay.current?.() ?? day,
              h = readHour.current?.() ?? hour,
              m = readMinute.current?.() ?? minute;
            if (!d && (h || m)) {
              E("请选择日期，或将时间留为 --:--");
              return;
            }
            if (!!h !== !!m) {
              E("请选完整时间，或将时间留为 --:--");
              return;
            }
            const score = p.mode === "score" ? Number(points) : undefined;
            if (
              p.mode === "score" &&
              (!points.trim() || !validPlanScore(score))
            ) {
              E(
                "请填写{min}到{max}的每次积分"
                  .replace("{min}", String(planRules.minScore))
                  .replace("{max}", String(planRules.maxScore)),
              );
              return;
            }
            Busy(true);
            try {
              await save(d, h ? h + ":" + m : "", score);
            } finally {
              Busy(false);
            }
          }}
        >
          OK！
        </button>
      </footer>
    </Dialog>
  );
}
