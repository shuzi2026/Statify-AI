import { Check } from "lucide-react";
import { Fragment } from "react";
import { unavailable } from "../engine";
import type { State } from "../model";
import type { todayPlanTodo } from "../planning";

export function PlanTodo({
  s,
  now,
  tasks,
  saving,
  start,
}: {
  s: State;
  now: number;
  tasks: ReturnType<typeof todayPlanTodo>["tasks"];
  saving: boolean;
  start: (id: string) => void;
}) {
  if (!tasks.length)
    return <p className="plan-todo-empty">今天还没有计划任务。</p>;

  return (
    <ul className="plan-todo-list" aria-label="今日计划任务">
      {tasks.map(({ key, card, value, target, done, times, nextTime }) => {
        const reason = done ? "" : unavailable(s, card, now);
        const blocked = done || !!reason || saving;
        return (
          <li
            className={done ? "plan-todo-row is-done" : "plan-todo-row"}
            key={key}
          >
            <button
              type="button"
              className="icon-button plan-todo-control"
              role="checkbox"
              aria-checked={done}
              aria-disabled={blocked}
              tabIndex={done ? -1 : undefined}
              aria-label={
                done
                  ? `已完成 ${card.name}`
                  : card.method === "instant"
                    ? `完成 ${card.name}`
                    : `开始 ${card.name}`
              }
              onClick={blocked ? undefined : () => start(card.id)}
            >
              <span className="plan-todo-box" aria-hidden>
                {done && <Check size={14} />}
              </span>
            </button>
            <div className="plan-todo-copy">
              <strong>{card.name}</strong>
              <small className="plan-todo-time">
                {times.map((time, index) => (
                  <Fragment key={time}>
                    {index > 0 && " · "}
                    <span className={time === nextTime ? "is-next" : undefined}>
                      {new Date(time).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hourCycle: "h23",
                      })}
                    </span>
                  </Fragment>
                ))}
                {(!times.length || (!done && nextTime === undefined)) && (
                  <>
                    {times.length > 0 && " · "}
                    {"未安排时间"}
                  </>
                )}
              </small>
              {reason && <small>{reason}</small>}
            </div>
            <span className="plan-todo-count">
              {value}/{target}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
