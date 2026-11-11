import { attributeRules } from "../../shared/rules/growth";
import { useState } from "react";
import { Dialog, Field, showNotice } from "../components";
import { uiLocale } from "../i18n/runtime";
import { NumberInput } from "../inputs/ValueInputs";
import { type State } from "../model";
import { adjustInitialLevels } from "./initial-levels";

type Run = (fn: (s: State) => unknown) => Promise<boolean>;
export function InitialDialog({
  s,
  run,
  close,
  suggested,
}: {
  s: State;
  run: Run;
  close: () => void;
  suggested?: Record<string, number>;
}) {
  const [values, V] = useState(
    { ...Object.fromEntries(s.attributes.filter((a) => a.slot >= 0).map((a) => [a.id, a.initial])), ...suggested },
  );
  return (
    <Dialog title="重新设定成长起点" close={close}>
      <p>
        只有初始等级改变，已经获得的任务经验会继续加在新起点上。成功保存消耗一次机会。
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await run((st) => adjustInitialLevels(st, values, Date.now()))
          ) {
            close();
            void showNotice(
              uiLocale
                ? "Initial levels updated successfully."
                : "初始属性等级修改成功",
            );
          }
        }}
      >
        {s.attributes
          .filter((a) => a.slot >= 0)
          .map((a) => (
            <Field key={a.id} label={a.name + "初始等级"}>
              <NumberInput
                required
                min="0"
                max={attributeRules.maxLevel}
                step="10"
                value={values[a.id]}
                onChange={(e) =>
                  V({ ...values, [a.id]: Number(e.target.value) })
                }
              />
            </Field>
          ))}
        <footer className="dialog-actions">
          <button type="button" onClick={close}>
            取消
          </button>
          <button className="primary">确认调整一次</button>
        </footer>
      </form>
    </Dialog>
  );
}
