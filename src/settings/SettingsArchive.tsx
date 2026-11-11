import { ChevronRight } from "lucide-react";
import { Dialog } from "../components";
import type { SettingsPanel } from "./types";
import type { SettingsArchiveState } from "./useSettingsArchive";
export function SettingsArchive({
  panel,
  Panel,
  state,
}: {
  panel: SettingsPanel;
  Panel: (panel: SettingsPanel) => void;
  state: SettingsArchiveState;
}) {
  const {
    backups,
    info,
    fileBusy,
    exportedAt,
    exportFile,
    importFile,
    protect,
    confirmExport,
    exportSavedBackup,
    cancelExport,
  } = state;
  return (
    <>
      {panel === "archive" && (
        <Dialog title="存档" close={() => Panel(null)}>
          <p>
            自动备份与人物存档保存在同一设备。清除站点数据或卸载应用可能同时删除它们；请另存一份备份到应用之外。
          </p>
          {info?.exportDue && (
            <p>建议每周导出一份备份，并确认文件已保存在应用之外。</p>
          )}
          <div className="settings-options">
            {" "}
            <button disabled={fileBusy} onClick={() => void exportFile()}>
              导出完整备份
              <ChevronRight size={17} />
            </button>
            <label className="settings-import">
              导入存档
              <ChevronRight size={17} />
              <input
                type="file"
                accept=".json,.gz,application/json,application/gzip"
                aria-label="导入存档"
                disabled={fileBusy}
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  e.currentTarget.value = "";
                  void importFile(file);
                }}
              />
            </label>
            <button disabled={fileBusy} onClick={() => void exportFile(true)}>
              导出压缩备份
              <ChevronRight size={17} />
            </button>
            {info?.canPersist && (
              <button disabled={info.persistent} onClick={() => void protect()}>
                {info.persistent ? "本地存档已保护" : "保护本地存档"}
                <ChevronRight size={17} />
              </button>
            )}
            <button onClick={() => Panel("backups")}>
              自动保留的备份
              <span>
                {backups.length}
                <ChevronRight size={17} />
              </span>
            </button>
          </div>
          {exportedAt !== null && (
            <div role="status" aria-label="备份保存确认">
              <p>
                已交给下载或分享。请在文件管理器或下载列表中找到备份，确认已保存到应用之外；仅打开分享或取消下载不算已保存。
              </p>
              <div className="dialog-actions">
                <button disabled={fileBusy} onClick={cancelExport}>
                  尚未保存
                </button>
                <button
                  disabled={fileBusy}
                  onClick={() => void confirmExport()}
                >
                  已保存到外部
                </button>
              </div>
            </div>
          )}
        </Dialog>
      )}
      {panel === "backups" && (
        <Dialog title="自动保留的备份" close={() => Panel("archive")}>
          <div className="settings-options">
            {backups.length ? (
              backups.map((b) => (
                <button key={b.id} onClick={() => void exportSavedBackup(b.id)}>
                  <span>
                    {new Date(b.at).toLocaleString()} · {b.reason}
                  </span>
                  <span>导出</span>
                </button>
              ))
            ) : (
              <p>暂无备份</p>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
