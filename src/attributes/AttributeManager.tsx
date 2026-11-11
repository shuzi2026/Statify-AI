import { attributeRules } from "../../shared/rules/growth";
import { ruleContext } from "../payments/access";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { useState } from "react";
import { moveAttribute } from "../attribute-library";
import { AttributeGrowthRecord } from "../AttributeGrowthRecord";
import { AttributeLibrary } from "../AttributeLibrary";
import { Dialog } from "../components";
import { dateKey } from "../engine";
import { type State } from "../model";
import { memberActive } from "../payments/access";

type Mutate = (
  fn: (s: State) => unknown,
  onError?: (message: string) => void,
) => Promise<boolean>;
export function AttributeManager({
  s,
  run,
  close,
}: {
  s: State;
  run: Mutate;
  close: () => void;
}) {
  const [library, Library] = useState(false);
  if (library)
    return <AttributeLibrary s={s} run={run} close={() => Library(false)} />;
  return (
    <Dialog
      title="属性与成长档案"
      className="attribute-growth-dialog"
      close={close}
      wide
    >
      <div className="attribute-manager">
        {s.attributes
          .filter((a) => a.slot >= 0)
          .sort((a, b) => a.slot - b.slot)
          .map((a) => (
            <AttributeGrowthRecord
              key={a.id}
              attribute={a}
              day={dateKey(Date.now())}
              controls={
                !memberActive() && a.slot < attributeRules.freeSlots ? (
                  <small>默认属性</small>
                ) : (
                  <button
                    className="icon-button"
                    aria-label={"移动 " + a.name}
                    onClick={() =>
                      run((st) => {
                        moveAttribute(
                          st,
                          a.id,
                          memberActive()
                            ? (a.slot + 1) % attributeRules.totalSlots
                            : a.slot === attributeRules.freeSlots
                              ? attributeRules.freeSlots + 1
                              : attributeRules.freeSlots,
                          ruleContext(Date.now()),
                        );
                      })
                    }
                  >
                    <ArrowUp size={16} />
                    <ArrowDown size={16} />
                  </button>
                )
              }
            />
          ))}
        <button
          className="attribute-library-add"
          aria-label="打开属性库"
          onClick={() => Library(true)}
        >
          <Plus size={20} />
        </button>
      </div>
    </Dialog>
  );
}
