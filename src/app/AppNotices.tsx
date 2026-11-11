import { Moon } from "lucide-react";
import { PlanReminder, DesktopPendingActions } from "../home/ActionNotices";
import type { AppViewProps } from "./types";
export function AppNotices({
  activity,
  s,
  mobile,
  controls,
  actions,
}: AppViewProps) {
  const { tab, now } = controls;
  const { run, complete, begin } = actions;
  const { reminders, pending } = activity;
  return (
    <>
      {tab === "today" && reminders.live[0] && (
        <PlanReminder message={reminders.live[0]} s={s} begin={begin} />
      )}
      {s.migrationNotice && (
        <div className="notice">
          <span>
            已带入 0.1 的卡牌与记录，原存档完整保留。部分状态使用兼容映射。
          </span>
          <button
            onClick={() =>
              run((st) => {
                st.migrationNotice = false;
              })
            }
          >
            知道了
          </button>
        </div>
      )}
      {s.restUntil > now && (
        <div className="rest-banner">
          <Moon size={22} />
          <div>
            <strong>今天就到这里。</strong>
            <small>
              休息到{" "}
              {new Date(s.restUntil).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              ，也可以随时回来。
            </small>
          </div>
          <button
            onClick={() =>
              run((st) => {
                st.restUntil = 0;
              })
            }
          >
            退出休息
          </button>
        </div>
      )}
      {!mobile && pending.length > 0 && (
        <DesktopPendingActions pending={pending} openFinish={complete} />
      )}
    </>
  );
}
