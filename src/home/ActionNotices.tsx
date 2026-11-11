import { ChevronRight } from "lucide-react";
import type { Action, Card, Entry, State } from "../model";
import type { planMessages } from "../planning";
import type { MobileHomeProps } from "./types";
export function MobilePendingActions(
  p: Pick<MobileHomeProps, "pending" | "timer" | "openFinish">,
) {
  return (
    <div className="mobile-activity">
      {p.pending
        .filter((a) => a.id !== p.timer?.id)
        .map((a) => (
          <button
            key={a.id}
            className="mobile-pending"
            onClick={() => p.openFinish(a.id)}
          >
            {a.card.name} · 查看行动 <ChevronRight size={14} />
          </button>
        ))}
    </div>
  );
}
export function DesktopPendingActions({
  pending,
  openFinish,
}: {
  pending: Action[];
  openFinish: (id: string) => Promise<void>;
}) {
  return (
    <div className="desktop-pending-actions">
      {pending.map((a) => (
        <button key={a.id} onClick={() => void openFinish(a.id)}>
          {a.card.name} · 查看行动
        </button>
      ))}
    </div>
  );
}
export function PlanReminder({
  message,
  s,
  begin,
}: {
  message: ReturnType<typeof planMessages>["live"][number];
  s: State;
  begin: (card: Card) => Promise<boolean | Entry>;
}) {
  return (
    <div className="plan-live-reminder" role="status">
      <span>{message.name} · 计划时间已到</span>
      <button
        onClick={() => {
          const c = s.cards.find((c) => c.id === message?.cardId);
          if (c) void begin(c);
        }}
      >
        开始
      </button>
    </div>
  );
}
