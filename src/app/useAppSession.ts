import { layoutMedia } from "../ui-layout/responsive";
import { useEffect, useState, useSyncExternalStore } from "react";
import { appSession } from "../application/session";
import { finishLaunch } from "../mobile-runtime";
import { usePayments } from "../payments/client";
import { useMemberAccess } from "../payments/use-member";
import { saveSnapshot, subscribeSave } from "../save-publication";

export function useAppSession() {
  const payments = usePayments();
  const hasMember = useMemberAccess();
  const startup = useSyncExternalStore(
    appSession.subscribe,
    appSession.snapshot,
  );
  const [mobile, setMobile] = useState(
    () => window.matchMedia(layoutMedia.mobile).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(layoutMedia.mobile),
      update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const snapshot = useSyncExternalStore(subscribeSave, saveSnapshot);
  const s = startup.phase === "ready" ? snapshot?.state ?? null : null;
  const bootError =
    startup.phase === "failed"
      ? "存档读取失败。原存档仍保留，请先导出原始存档，再重试打开应用。"
      : "";
  useEffect(() => {
    if (s || bootError) void finishLaunch();
  }, [!!s, bootError]);
  return { payments, hasMember, startup, mobile, snapshot, s, bootError };
}
