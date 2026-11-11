import { statusRules } from "../../shared/rules/status";
import { useState } from "react";
import { Dialog, Field } from "../components";
import { correctStatus, statusValue } from "../engine";
import { statusKeys, statusNames, type State } from "../model";

type Run = (fn: (s: State) => unknown) => Promise<boolean>;
export function StatusDialog({
  s,
  close,
  run,
  suggested,
}: {
  s: State;
  close: () => void;
  run: Run;
  suggested?: Parameters<typeof correctStatus>[1];
}) {
  const [original] = useState(() =>
    Object.fromEntries(
      statusKeys.map((k) => [k, statusValue(s, k, Date.now())]),
    ),
  );
  const [values, V] = useState<Parameters<typeof correctStatus>[1]>(() => ({ ...(suggested ?? original) }));
  return (
    <Dialog title="此刻，你感觉怎么样？" close={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run((st) => correctStatus(st, values, Date.now()))) close();
        }}
      >
        {statusKeys.map((k) => (
          <Field key={k} label={statusNames[k] + " " + (values[k] ?? original[k])}>
            <input
              aria-label={statusNames[k]}
              type="range"
              min={statusRules.min}
              max={statusRules.max}
              step="1"
              value={values[k] ?? original[k]}
              onChange={(e) => V({ ...values, [k]: Number(e.target.value) })}
            />
          </Field>
        ))}
        <footer className="dialog-actions">
          <button type="button" onClick={() => V(suggested ? {} : { ...original })}>
            保持原样
          </button>
          <button className="primary">保存当前状态</button>
        </footer>
      </form>
    </Dialog>
  );
}
