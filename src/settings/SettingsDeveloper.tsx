import { lazy, Suspense, useState } from "react";
import { ChevronRight } from "lucide-react";
import { compatibilityReport } from "../compatibility";
import { Dialog, Field } from "../components";
import { download } from "../storage";
import type { SettingsProps, SettingsPanel } from "./types";
export const hardened = import.meta.env.VITE_STATIFY_HARDENED === "1";
const DeveloperUI = hardened
  ? () => null
  : lazy(() =>
      import("../ui-layout/DeveloperUI").then((module) => ({
        default: module.DeveloperUI,
      })),
    );

export function useSettingsDeveloper() {
  const [diagnostics, Diagnostics] = useState<string | null>(null),
    [pin, Pin] = useState(""),
    [pinError, PinError] = useState("");
  return { diagnostics, Diagnostics, pin, Pin, pinError, PinError };
}
export function DeveloperWorkbench({ close }: { close: () => void }) {
  return (
    <Suspense fallback={null}>
      <DeveloperUI close={close} />
    </Suspense>
  );
}
export function SettingsDeveloper({
  panel,
  Panel,
  state,
  error,
}: Pick<SettingsProps, "error"> & {
  panel: SettingsPanel;
  Panel: (panel: SettingsPanel) => void;
  state: ReturnType<typeof useSettingsDeveloper>;
}) {
  const { diagnostics, Diagnostics, pin, Pin, pinError, PinError } = state;
  return (
    <>
      {panel === "developer-pin" && (
        <Dialog title="开发者模式" close={() => Panel(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pin === "12346") {
                Pin("");
                Panel("developer");
              } else PinError("密码不正确");
            }}
          >
            <Field label="请输入密码">
              <input
                aria-label="开发者模式密码"
                type="password"
                inputMode="numeric"
                maxLength={5}
                autoFocus
                value={pin}
                onChange={(e) => {
                  Pin(e.target.value);
                  PinError("");
                }}
              />
            </Field>
            {pinError && <p role="alert">{pinError}</p>}
            <footer className="dialog-actions">
              <button type="button" onClick={() => Panel(null)}>
                取消
              </button>
              <button className="primary">打开</button>
            </footer>
          </form>
        </Dialog>
      )}
      {panel === "developer" && (
        <Dialog title="开发者模式" close={() => Panel(null)}>
          <div className="settings-options">
            {" "}
            <button
              onClick={() =>
                void compatibilityReport()
                  .then((report) =>
                    Diagnostics(JSON.stringify(report, null, 2)),
                  )
                  .catch(() => error("暂时无法读取设备信息"))
              }
            >
              兼容信息
              <ChevronRight size={17} />
            </button>
            {!hardened && (
              <button onClick={() => Panel("ui")}>
                UI布局工具
                <ChevronRight size={17} />
              </button>
            )}
          </div>
        </Dialog>
      )}
      {diagnostics !== null && (
        <Dialog title="兼容信息" close={() => Diagnostics(null)}>
          <p>
            仅包含版本、屏幕和运行环境，不包含账号或个人存档。导出后可自行分享。
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              fontSize: 12,
            }}
          >
            {diagnostics}
          </pre>
          <div className="dialog-actions">
            <button
              onClick={() =>
                void download(diagnostics, "Statify-compatibility.json").catch(
                  () => error("导出未完成"),
                )
              }
            >
              导出兼容信息
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
