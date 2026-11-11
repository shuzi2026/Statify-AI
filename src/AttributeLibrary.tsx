import { ruleContext } from "./payments/access";
import { attributeRules, initialValues } from "../shared/rules/growth";
import { useMemberAccess } from "./payments/use-member";
import { MemberNotice, useMemberPrompt } from "./payments/MemberNotice";
import { memberActive } from "./payments/access";
import { useState } from "react";
import { Plus } from "lucide-react";
import { type State } from "./model";
import { Dialog, Field } from "./components";
import { growth, trialActive } from "./engine";
import {
  attributeTemplates,
  createAttribute,
  placeAttribute,
} from "./attribute-library";
type Run = (
  fn: (s: State) => unknown,
  onError?: (message: string) => void,
) => Promise<boolean>;
export function AttributeLibrary({
  s,
  run,
  close,
}: {
  s: State;
  run: Run;
  close: () => void;
}) {
  const member = useMemberAccess(),
    memberPrompt = useMemberPrompt();
  const [creating, Creating] = useState(false),
    [name, Name] = useState(""),
    [initial, Initial] = useState<number>(initialValues.attributeLevel),
    [selected, Selected] = useState<
      { id: string; name: string } | { name: string } | null
    >(null),
    [slot, Slot] = useState(attributeRules.freeSlots),
    [error, Error] = useState(""),
    [busy, Busy] = useState(false);
  const select = (value: typeof selected) => {
    Selected(value);
    Initial(initialValues.attributeLevel);
    Error("");
  };
  const saveNew = async () => {
    Error("");
    Busy(true);
    try {
      if (
        await run((st) => {
          createAttribute(st, name, initial);
        }, Error)
      ) {
        Creating(false);
        Name("");
        Initial(initialValues.attributeLevel);
      }
    } finally {
      Busy(false);
    }
  };
  const apply = async () => {
    if (!selected) return;
    if (
      !trialActive(s, ruleContext(Date.now())) ||
      (!memberActive() && slot < attributeRules.freeSlots)
    ) {
      memberPrompt.prompt();
      return;
    }
    Error("");
    Busy(true);
    try {
      if (
        await run((st) => {
          placeAttribute(
            st,
            "id" in selected
              ? { id: selected.id }
              : { name: selected.name, initial },
            slot, ruleContext(Date.now())
          );
        }, Error)
      )
        close();
    } finally {
      Busy(false);
    }
  };
  return (
    <Dialog
      title={creating ? "新建属性" : selected ? "选择属性槽位" : "属性库"}
      className="attribute-library-dialog"
      close={close}
      dismissible={!busy}
    >
      {creating ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveNew();
          }}
        >
          <Field
            label="属性名称"
            inlineHint
            hint="最多8个宽字符，英文按字宽折算"
          >
            <input
              aria-label="属性名称"
              autoFocus
              required
              maxLength={64}
              value={name}
              onChange={(e) => Name(e.target.value)}
              disabled={busy}
            />
          </Field>
          <Field label={"初始等级 " + initial}>
            <input
              aria-label="初始等级"
              type="range"
              min="0"
              max={attributeRules.maxLevel}
              step="10"
              value={initial}
              onChange={(e) => Initial(Number(e.target.value))}
            />
          </Field>
          {error && <p role="alert">{error}</p>}
          <footer className="dialog-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                Creating(false);
                Error("");
              }}
            >
              返回属性库
            </button>
            <button className="primary" disabled={busy}>
              保存到属性库
            </button>
          </footer>
        </form>
      ) : selected ? (
        <>
          <p className="attribute-library-choice">{selected.name}</p>
          {"id" in selected ? (
            <p className="help">沿用已有等级和成长经验。</p>
          ) : (
            <Field label={"初始等级 " + initial}>
              <input
                aria-label="初始等级"
                type="range"
                min="0"
                max={attributeRules.maxLevel}
                step="10"
                value={initial}
                onChange={(e) => Initial(Number(e.target.value))}
              />
            </Field>
          )}
          <Field label="放入槽位">
            <select
              aria-label="放入槽位"
              value={slot}
              onChange={(e) => Slot(Number(e.target.value))}
            >
              {Array.from({ length: attributeRules.totalSlots }, (_, i) => i)
                .filter((i) => member || i >= attributeRules.freeSlots)
                .map((n) => (
                  <option key={n} value={n}>
                    第{n + 1}槽 ·{" "}
                    {s.attributes.find((a) => a.slot === n)?.name || "空槽位"}
                  </option>
                ))}
            </select>
          </Field>
          <p className="help">被替换的属性回到属性库，已有成长保留。</p>
          {!trialActive(s, ruleContext(Date.now())) && (
            <MemberNotice pulse={memberPrompt.pulse}>
              开通会员后，可替换属性并使用更多属性槽位。
            </MemberNotice>
          )}
          {error && <p role="alert">{error}</p>}
          <footer className="dialog-actions">
            <button disabled={busy} onClick={() => select(null)}>
              返回属性库
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void apply()}
            >
              应用到槽位
            </button>
          </footer>
        </>
      ) : (
        <>
          <section className="attribute-library-section">
            <h3>已有属性</h3>
            {s.attributes.map((a) => (
              <button
                className="attribute-library-item"
                key={a.id}
                disabled={a.slot >= 0}
                aria-label={"选择已有属性 " + a.name}
                onClick={() => select({ id: a.id, name: a.name })}
              >
                <span>
                  <strong>{a.name}</strong>
                  <small>
                    Lv. {growth(a).level} · 成长经验 {Math.round(a.earned)}
                  </small>
                </span>
                <small>{a.slot >= 0 ? "使用中" : "替换使用"}</small>
              </button>
            ))}
          </section>
          <section className="attribute-library-section">
            <h3>属性模板</h3>
            {attributeTemplates
              .filter((t) => !s.attributes.some((a) => a.name === t.name))
              .map((t) => (
                <button
                  className="attribute-library-item"
                  key={t.name}
                  aria-label={"选择属性模板 " + t.name}
                  onClick={() => select({ name: t.name })}
                >
                  <span>
                    <strong>{t.name}</strong>
                    <small>{t.definition}</small>
                  </span>
                  <Plus size={16} />
                </button>
              ))}
          </section>
          <button
            className="attribute-library-create"
            onClick={() => {
              Creating(true);
              Error("");
              Name("");
              Initial(initialValues.attributeLevel);
            }}
          >
            <Plus size={17} />
            新建属性
          </button>
        </>
      )}
    </Dialog>
  );
}
