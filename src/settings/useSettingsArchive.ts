import { useEffect, useState } from "react";
import { confirmAction } from "../components";
import { application } from "../application/runtime";
import {
  backupFile,
  download,
  exportBackup,
  confirmBackupExport,
  readRevision,
  listBackups,
  maxImportBytes,
  readImportFile,
  requestPersistence,
  storageStatus,
} from "../storage";
import type { SettingsProps } from "./types";

// Called by SettingsPage so pending operations and confirmation survive panel navigation.
export function useSettingsArchive({
  notify,
  error,
}: Pick<SettingsProps, "notify" | "error">) {
  const [backups, B] = useState<{ id: string; at: number; reason: string }[]>(
      [],
    ),
    [info, Info] = useState<Awaited<ReturnType<typeof storageStatus>> | null>(
      null,
    ),
    [fileBusy, FileBusy] = useState(false),
    [exportedAt, ExportedAt] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    void listBackups()
      .then((rows) => {
        if (active) B(rows);
      })
      .catch((e) => error(e.message));
    void storageStatus()
      .then((value) => {
        if (active) Info(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function exportFile(compressed = false) {
    FileBusy(true);
    ExportedAt(null);
    try {
      const at = Date.now();
      await exportBackup(compressed);
      ExportedAt(at);
      Info(await storageStatus());
    } catch (e) {
      error("备份未完成：" + (e as Error).message);
    } finally {
      FileBusy(false);
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    if (file.size > maxImportBytes) {
      error("存档不能超过64MB");
      return;
    }
    FileBusy(true);
    try {
      const expectedRevision = await readRevision();
      const text = await readImportFile(file, file.name);
      if (
        !(await confirmAction(
          "用此文件替换当前存档？替换成功后将放弃未提交的输入和草稿；取消或失败会保留它们。替换前将自动保留当前备份。",
        ))
      )
        return;
      await application.importSave(text, {
        expectedRevision,
        discardInputsConfirmed: true,
      });
      ExportedAt(null);
      B(await listBackups());
      notify("存档已导入");
    } catch (err) {
      error("导入失败：" + (err as Error).message);
    } finally {
      FileBusy(false);
    }
  }
  async function protect() {
    try {
      const granted = await requestPersistence();
      Info(await storageStatus());
      notify(granted ? "已开启本地存档保护" : "浏览器暂未允许，请定期导出备份");
    } catch (e) {
      error((e as Error).message);
    }
  }
  async function confirmExport() {
    if (exportedAt === null) return;
    FileBusy(true);
    try {
      await confirmBackupExport(exportedAt);
      ExportedAt(null);
      Info(await storageStatus());
    } catch (e) {
      error((e as Error).message);
    } finally {
      FileBusy(false);
    }
  }
  async function exportSavedBackup(id: string) {
    try {
      const file = await backupFile(id);
      await download(
        file.data,
        "Statify-backup-" + id.replace(/:/g, "-") + file.suffix,
      );
    } catch (e) {
      error("备份未完成：" + (e as Error).message);
    }
  }
  return {
    backups,
    info,
    fileBusy,
    exportedAt,
    exportFile,
    importFile,
    protect,
    confirmExport,
    exportSavedBackup,
    cancelExport: () => ExportedAt(null),
  };
}
export type SettingsArchiveState = ReturnType<typeof useSettingsArchive>;
