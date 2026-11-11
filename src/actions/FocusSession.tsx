import { Pause, Play } from "lucide-react";
import { ActionQuantity } from "./ActionQuantity";
import { Dialog, timeText } from "../components";
import { elapsed } from "../engine";
import { ThemeArtwork } from "../themes/ThemeArtwork";
import type { Action } from "../model";
import { useActionTime } from "../app/useViewTime";

export function FocusSession({
  action: a,
  pause,
  finish,
  changeQuantity,
  openAi,
  busy = false,
}: {
  changeQuantity: (n: number) => void;
  action: Action;
  pause: () => void;
  finish: () => void;
  busy?: boolean;
  openAi?: () => void;
}) {
  const now = useActionTime(a.runningSince !== null);
  const seconds = elapsed(a, now),
    fixed = a.card.method === "duration",
    remaining = Math.max(0, a.card.minutes * 60 - seconds);
  return (
    <Dialog
      title={a.card.name}
      className="focus-session"
      dismissible={false}
      close={() => {}}
    >
      <main className="focus-content">
        <div className="focus-art" aria-hidden="true">
          <ThemeArtwork card={a.card} />
        </div>
        <span>
          {a.runningSince === null
            ? "已暂停"
            : fixed
              ? remaining > 0
                ? "剩余时间"
                : "目标已完成"
              : "已投入时间"}
        </span>
        <output
          className="timer-clock"
          aria-label={fixed ? "倒计时" : "正计时"}
        >
          {timeText(fixed ? remaining : seconds)}
        </output>
        <p>{a.card.message || a.card.description}</p>
        <ActionQuantity action={a} change={changeQuantity} busy={busy} />
      </main>
      <footer className="dialog-actions">
        {openAi && <button type="button" disabled={busy} onClick={openAi}>{"与 AI 对话"}</button>}
        <button
          aria-label={a.runningSince === null ? "继续计时" : "暂停计时"}
          disabled={busy}
          onClick={pause}
        >
          {a.runningSince === null ? <Play size={20} /> : <Pause size={20} />}{" "}
          {a.runningSince === null ? "继续" : "暂停"}
        </button>
        <button className="primary" disabled={busy} onClick={finish}>
          完成
        </button>
      </footer>
    </Dialog>
  );
}
