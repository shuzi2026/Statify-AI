import { useState, type CSSProperties } from "react";
import { Plus, Ellipsis } from "lucide-react";
import type { Meter } from "./model";
import { Dialog } from "./components";
import { meterPacking, meterDisplay } from "./meters";

export function MobileMeters({
  meters,
  open,
}: {
  meters: Meter[];
  open: (id?: string) => void;
}) {
  const [more, More] = useState(false);
  let shown = meters.length;
  while (shown > 0 && !meterPacking(meters.slice(0, shown)).fits) shown--;
  const layout = meterPacking(meters.slice(0, shown)),
    overflow = shown < meters.length;
  // Only use the worst-case budget as an upper bound; actual bubbles hug their
  // current content. Two-digit / requested-range space is calculated, never painted empty.
  const position = (index: number) =>
    ({ "--meter-max-width": layout.slots[index].width }) as CSSProperties;
  return (
    <>
      <section className="mobile-meters" aria-label="自定义数值">
        {meters.slice(0, shown).map((m, i) => (
          <button
            className="meter-bubble"
            style={position(i)}
            key={m.id}
            onClick={() => open(m.id)}
            aria-label={"调整数值 " + m.name}
            title={`${m.name} ${m.value} ${m.unit}`}
          >
            <span>{m.name}</span>
            <strong>{meterDisplay(m.value)}</strong>
            {m.unit && <small>{m.unit}</small>}
          </button>
        ))}
        <button
          className="icon-button"
          style={position(shown)}
          aria-label={overflow ? "查看全部数值" : "新建数值"}
          onClick={() => (overflow ? More(true) : open())}
        >
          {overflow ? <Ellipsis /> : <Plus />}
        </button>
      </section>
      {more && (
        <Dialog title="全部自定义数值" close={() => More(false)}>
          <div className="meter-overflow-list">
            {meters.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  More(false);
                  open(m.id);
                }}
              >
                {m.name} <strong>{m.value}</strong> {m.unit}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              More(false);
              open();
            }}
          >
            新建数值
          </button>
        </Dialog>
      )}
    </>
  );
}
