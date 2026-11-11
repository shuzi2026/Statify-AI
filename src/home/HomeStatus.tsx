import { Plus } from "lucide-react";
import { coefficient, sleepCycle, statusValue } from "../engine";
import { statusKeys, statusNames } from "../model";
import { statusRules } from "../../shared/rules/status";
import { meterDisplay } from "../meters";
import { ExecutionHUD } from "../PlanHUD";
import type { MobileHomeProps } from "./types";
export function MobileStatus(
  p: Pick<
    MobileHomeProps,
    "s" | "now" | "notification" | "executionLevel" | "openStatus"
  >,
) {
  const { s, now } = p;
  const missingSleep = s.sleepCycle !== sleepCycle(now);
  return (
    <header className="mobile-hud">
      {p.notification}
      <ExecutionHUD s={p.s} now={p.now} level={p.executionLevel} />
      <div className="compact-status">
        <button className="mobile-coefficient" onClick={p.openStatus}>
          状态系数 <b>×{coefficient(s, now).toFixed(2)}</b>
        </button>
        <div className="mobile-status-values" aria-label="五项状态">
          {statusKeys.map((k) => {
            const v = statusValue(s, k, now);
            return (
              <button
                key={k}
                onClick={p.openStatus}
                aria-label={
                  statusNames[k] +
                  " " +
                  (k === "sleep" && missingSleep ? "待填" : v) +
                  "，调整状态"
                }
              >
                <span>{k === "comfort" ? "舒适" : statusNames[k]}</span>
                <strong>{k === "sleep" && missingSleep ? "—" : v}</strong>
                <progress
                  aria-label={statusNames[k] + "状态"}
                  max={statusRules.max}
                  value={k === "sleep" && missingSleep ? 0 : v}
                />
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
export function DesktopIdentity({
  s,
  now,
  executionLevel,
  openStatus,
}: Pick<MobileHomeProps, "s" | "now" | "executionLevel" | "openStatus">) {
  return (
    <div className="desktop-identity">
      {" "}
      <header className="player-hud">
        <div className="player-identity">
          <h1>{s.profile.name}</h1>
          <span>{s.profile.age}岁</span>
          <ExecutionHUD s={s} now={now} level={executionLevel} showMonth />
        </div>
        <button
          className="coefficient-chip"
          onClick={openStatus}
          aria-label={
            "成长系数 " + coefficient(s, now).toFixed(2) + "，调整状态"
          }
        >
          <span>成长系数</span>
          <strong>×{coefficient(s, now).toFixed(2)}</strong>
        </button>
      </header>
    </div>
  );
}
export function DesktopStatus({
  s,
  now,
  openStatus,
}: Pick<MobileHomeProps, "s" | "now" | "openStatus">) {
  const missingSleep = s.sleepCycle !== sleepCycle(now);
  return (
    <div className="status-hud" aria-label="五项状态">
      {statusKeys.map((k) => {
        const v = statusValue(s, k, now);
        return (
          <button
            key={k}
            className={"status-cell status-" + k}
            onClick={openStatus}
            aria-label={
              statusNames[k] +
              " " +
              (k === "sleep" && missingSleep ? "待填" : v) +
              "，调整状态"
            }
          >
            <span>{k === "comfort" ? "舒适度" : statusNames[k]}</span>
            <strong>
              {k === "sleep" && missingSleep ? <small title="待填">—</small> : v}
            </strong>
            <progress
              value={k === "sleep" && missingSleep ? 0 : v}
              max={statusRules.max}
              aria-label={statusNames[k] + "状态"}
            />
          </button>
        );
      })}
    </div>
  );
}

export function DesktopValues({
  s,
  openMeter,
}: Pick<MobileHomeProps, "s" | "openMeter">) {
  return (
    <section className="value-hud" aria-label="自定义数值">
      <span className="value-hud-label">数值</span>
      <div className="value-hud-items">
        {s.meters.length ? (
          s.meters.map((v) => (
            <button
              key={v.id}
              onClick={() => openMeter(v.id)}
              aria-label={"调整数值 " + v.name}
            >
              <span>{v.name}</span>
              <strong>{meterDisplay(v.value)}</strong>
              <small>{v.unit}</small>
            </button>
          ))
        ) : (
          <span className="no-values">还没有自定义数值</span>
        )}
      </div>
      <button
        className="icon-button"
        aria-label="新建数值"
        onClick={() => openMeter()}
      >
        <Plus size={18} />
      </button>
    </section>
  );
}
