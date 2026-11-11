import { useState, useSyncExternalStore } from "react";
import { RotateCcw } from "lucide-react";
import { GUEST_TEST_RESET_PATH } from "../../shared/ai-chat";
import { application } from "../application/runtime";
import { confirmAction, showNotice } from "../components";
import { db } from "../storage";
import "./guest-test-reset.css";

export function GuestTestReset() {
  const [resetting, setResetting] = useState(false);
  const saving = useSyncExternalStore(application.subscribeBusy, application.isBusy);

  async function reset() {
    setResetting(true);
    try {
      const confirmed = await confirmAction(
        "清除此测试端口的角色、卡牌、外观、购物记录和 AI 记忆，再从首次访问开始？",
        "重置访客",
      );
      if (!confirmed || application.isBusy()) return;
      const response = await fetch(GUEST_TEST_RESET_PATH, { method: "POST" });
      if (!response.ok) throw new Error("Guest session reset failed");
      await db.delete();
      localStorage.clear();
      sessionStorage.clear();
      location.replace("/");
    } catch {
      void showNotice("访客重置未完成，请重试。");
    } finally {
      setResetting(false);
    }
  }

  return (
    <button className="guest-test-reset" type="button" disabled={saving || resetting} onClick={() => void reset()}>
      <RotateCcw size={16} aria-hidden="true" />
      重置访客
    </button>
  );
}
