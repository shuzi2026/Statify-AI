import type { Action } from "../model";
import { elapsed } from "../engine";
import { timeText } from "../components";
import { useActionTime } from "../app/useViewTime";

export function RemoteTimerStatus({ action }: { action: Action }) {
  const now = useActionTime(
    action.runningSince !== null && action.endedAt === null,
  );
  return (
    <section className="membership-block remote-timer-status" role="status">
      <p>
        另一设备的任务：<strong>{action.card.name}</strong>
      </p>
      <p>
        {action.endedAt !== null
          ? "等待结算"
          : action.runningSince === null
            ? "已暂停"
            : "正在计时"}
        {" · "}
        <output aria-label="另一设备计时">
          {timeText(elapsed(action, now))}
        </output>
      </p>
      <p className="help">
        请在原设备暂停、继续或完成。断网后显示的是上次同步状态。
      </p>
    </section>
  );
}
