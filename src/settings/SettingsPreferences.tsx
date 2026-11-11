import { useState } from "react";
import { Dialog, Field } from "../components";
import { CardMotionSwitch } from "../cards/CardMotionSwitch";
import { NumberInput } from "../inputs/ValueInputs";
import { rules, type State } from "../model";
import { setPlanMode } from "../planning";
import { MemberThemeChooser } from "../themes/ThemeChooser";
import type { SettingsProps, SettingsPanel } from "./types";
export function SettingsPreferences({
  s,
  run,
  notify,
  panel,
  Panel,
}: Pick<SettingsProps, "s" | "run" | "notify"> & {
  panel: SettingsPanel;
  Panel: (panel: SettingsPanel) => void;
}) {
  return (
    <>
      {panel === "motion" && (
        <Dialog title="减少动态效果" close={() => Panel(null)}>
          <div className="settings-options">
            <CardMotionSwitch preference="cardFloatingOverride" />
            <CardMotionSwitch preference="cardLighting" />
          </div>
        </Dialog>
      )}
      {panel === "rewards" && (
        <RewardLimits
          s={s}
          close={() => Panel(null)}
          save={async (perUnit, total) => {
            if (
              await run((st) => {
                st.preferences.rewardPerUnitMax = perUnit;
                st.preferences.rewardTotalMax = total;
              })
            )
              Panel(null);
          }}
        />
      )}
      {panel === "theme" && (
        <MemberThemeChooser close={() => Panel(null)} notify={notify} />
      )}
      {panel === "early" && (
        <Dialog title="提前完成任务" close={() => Panel(null)}>
          <div className="settings-options">
            {(["ask", "count", "record"] as const).map((value) => (
              <button
                key={value}
                aria-pressed={s.preferences.earlyCompletion === value}
                onClick={async () => {
                  if (
                    await run((st) => {
                      st.preferences.earlyCompletion = value;
                    })
                  )
                    Panel(null);
                }}
              >
                {
                  { ask: "每次询问", count: "完成一次", record: "只记录投入" }[
                    value
                  ]
                }
              </button>
            ))}
          </div>
        </Dialog>
      )}
      {panel === "mode" && (
        <Dialog title="计划结算模式" close={() => Panel(null)}>
          <div className="settings-options">
            {(["cards", "score"] as const).map((mode) => (
              <button
                key={mode}
                aria-pressed={s.planMode === mode}
                onClick={async () => {
                  if (await run((st) => setPlanMode(st, mode, Date.now())))
                    Panel(null);
                }}
              >
                {mode === "cards" ? "卡牌模式" : "积分模式"}
                {s.planMode === mode && <span>已选</span>}
              </button>
            ))}
          </div>
        </Dialog>
      )}
    </>
  );
}
function RewardLimits({
  s,
  close,
  save,
}: {
  s: State;
  close: () => void;
  save: (perUnit: number, total: number) => Promise<void>;
}) {
  const [perUnit, PerUnit] = useState(String(s.preferences.rewardPerUnitMax)),
    [total, Total] = useState(String(s.preferences.rewardTotalMax)),
    [error, Error] = useState(""),
    [busy, Busy] = useState(false);
  return (
    <Dialog title="奖励滑轨上限" close={close} dismissible={!busy}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const a = Number(perUnit),
            b = Number(total);
          if (
            !perUnit.trim() ||
            !total.trim() ||
            ![a, b].every(
              (v) =>
                Number.isInteger(v) && v >= 1 && v <= rules.dailyExperience,
            )
          ) {
            Error("请填写1到1000的整数");
            return;
          }
          Busy(true);
          try {
            await save(a, b);
          } finally {
            Busy(false);
          }
        }}
      >
        <Field label="每数量／每分钟的最大值">
          <NumberInput
            aria-label="每数量或每分钟奖励上限"
            min="1"
            max={rules.dailyExperience}
            step="1"
            required
            value={perUnit}
            onChange={(e) => PerUnit(e.target.value)}
          />
        </Field>
        <Field label="每次整体奖励的最大值">
          <NumberInput
            aria-label="整体奖励上限"
            min="1"
            max={rules.dailyExperience}
            step="1"
            required
            value={total}
            onChange={(e) => Total(e.target.value)}
          />
        </Field>
        <p className="help">仅调整滑轨范围，已保存的奖励保持原值。</p>
        {error && <p role="alert">{error}</p>}
        <footer className="dialog-actions">
          <button type="button" disabled={busy} onClick={close}>
            取消
          </button>
          <button className="primary" disabled={busy}>
            保存
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
