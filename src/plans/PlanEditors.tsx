import { PlanCardEditor } from "./PlanCardEditor";
import { SchedulePicker } from "./SchedulePicker";
import type { PlanBoard } from "./usePlanBoard";
export function PlanEditors({ board, now }: { board: PlanBoard; now: number }) {
  const {
    p,
    configuring,
    Configure,
    cardError,
    choosing,
    Choose,
    scheduleError,
    saveCard,
    saveSchedule,
  } = board;
  return (
    <>
      {configuring && (
        <PlanCardEditor
          key={(configuring.adding ? "add:" : "edit:") + configuring.card.id}
          card={configuring.card}
          mode={p.mode}
          target={
            (p.cards.find((r) => r.id === configuring.card.id)?.target || 0) +
              (configuring.adding && configuring.increment ? 1 : 0) || 1
          }
          score={
            configuring.adding
              ? undefined
              : (p.cards.find((r) => r.id === configuring.card.id)?.score ??
                configuring.card.score)
          }
          error={cardError}
          close={() => Configure(null)}
          save={saveCard}
        />
      )}
      {choosing && (
        <SchedulePicker
          key={choosing.slotId || choosing.card.id}
          p={p}
          card={choosing.card}
          slotId={choosing.slotId}
          externalError={scheduleError}
          now={now}
          close={() => Choose(null)}
          save={saveSchedule}
        />
      )}
    </>
  );
}
