import { useState, type FormEvent } from "react";
import { Dialog, Field } from "../components";
import { NumberInput } from "../inputs/ValueInputs";
import { checkMeterCapacity, meterLimit } from "../meters";
import { uid, type Meter, type State } from "../model";
import { checkTextLength, textLimits } from "../text-limits";

type Mutate = (
  fn: (s: State) => unknown,
  onError?: (message: string) => void,
) => Promise<boolean>;
export function MeterForm({
  initial,
  suggested,
  close,
  run,
  remove,
}: {
  initial?: Meter;
  suggested?: { changes: Partial<Omit<Meter, "id">>; original?: Meter };
  close: () => void;
  run: Mutate;
  remove: (id: string) => Promise<boolean>;
}) {
  const [v, set] = useState<Meter>(() => ({
    ...(initial
      ? {
          ...structuredClone(initial),
          value: Math.round(initial.value),
          precision: 0,
          min: initial.min === null ? null : Math.round(initial.min),
          max: initial.max === null ? null : Math.round(initial.max),
        }
      : {
          id: uid(),
          name: "",
          unit: "",
          value: 0,
          precision: 0,
          min: -99,
          max: 99,
        }),
    ...suggested?.changes,
  }));
  const [rangeOpen, RangeOpen] = useState(
      (initial !== undefined || suggested !== undefined) && (v.min !== null || v.max !== null),
    ),
    [error, E] = useState<{ field: string; message: string } | null>(null),
    [saving, Saving] = useState(false);
  const valueLabel = initial ? "当前值" : "初始值",
    rangeText =
      v.min === null && v.max === null
        ? "未设置范围"
        : v.min === null
          ? "最高 " + v.max
          : v.max === null
            ? "最低 " + v.min
            : v.min + " ～ " + v.max;
  const errorId = (field: string) =>
    error?.field === field ? v.id + "-" + field + "-error" : undefined;
  const errorText = (field: string) =>
    error?.field === field ? (
      <small id={errorId(field)} className="meter-error" role="alert">
        {error.message}
      </small>
    ) : null;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    E(null);
    if (!v.name.trim()) {
      E({ field: "name", message: "请填写数值名称" });
      return;
    }
    if (
      [v.value, v.min, v.max].some(
        (n) =>
          n !== null &&
          (!Number.isFinite(n) ||
            !Number.isInteger(n) ||
            Math.abs(n) > meterLimit),
      )
    ) {
      E({ field: "value", message: "数值及上下限须为 −9999～9999 的整数" });
      RangeOpen(true);
      return;
    }
    if (v.min !== null && v.max !== null && v.min > v.max) {
      E({ field: "range", message: "最低值不能大于最高值" });
      RangeOpen(true);
      return;
    }
    if (
      (v.min !== null && v.value < v.min) ||
      (v.max !== null && v.value > v.max)
    ) {
      E({ field: "value", message: valueLabel + "须在设置的范围内" });
      RangeOpen(true);
      return;
    }
    Saving(true);
    try {
      if (
        await run(
          (s) => {
            const old = s.meters.find((m) => m.id === v.id);
            if (suggested?.original && JSON.stringify(old) !== JSON.stringify(suggested.original))
              throw Error("数值已变化，请重新打开后编辑。");
            if (s.meters.some((m) => m.id !== v.id && m.name === v.name.trim()))
              throw Error("已存在同名数值");
            checkMeterCapacity(s.meters, { ...v, name: v.name.trim() });
            checkTextLength(
              v.name.trim(),
              textLimits.meterName,
              "数值名称",
              old?.name,
            );
            checkTextLength(v.unit, textLimits.unit, "单位", old?.unit);
            s.changes.push({
              id: uid(),
              at: Date.now(),
              kind: "手动数值",
              objectId: v.id,
              name: v.name,
              before: old?.value || 0,
              after: v.value,
              note: old ? "编辑或纠正" : "创建",
            });
            const next = {
              ...v,
              name: v.name.trim(),
              precision: 0,
              value: Math.round(v.value),
              min: v.min === null ? null : Math.round(v.min),
              max: v.max === null ? null : Math.round(v.max),
            };
            s.meters = old
              ? s.meters.map((m) => (m.id === v.id ? next : m))
              : [...s.meters, next];
          },
          (message) =>
            E({ field: message.includes("同名") ? "name" : "save", message }),
        )
      )
        close();
    } finally {
      Saving(false);
    }
  }
  return (
    <Dialog
      title={initial ? "编辑数值" : "新建自定义数值"}
      className="meter-form-dialog"
      close={close}
      dismissible={!saving}
    >
      <form noValidate onSubmit={submit} aria-busy={saving}>
        <div className="meter-fields">
          <Field
            label="数值名称"
            inlineHint
            hint={`最多${textLimits.meterName}个字符`}
          >
            <input
              autoFocus
              required
              maxLength={textLimits.meterName}
              disabled={saving}
              value={v.name}
              aria-invalid={error?.field === "name" || undefined}
              aria-describedby={errorId("name")}
              onChange={(e) => {
                set({ ...v, name: e.target.value });
                E(null);
              }}
            />
            {errorText("name")}
          </Field>
          <div className="meter-value-unit">
            <Field label={valueLabel}>
              <NumberInput
                required
                step="1"
                min={-meterLimit}
                max={meterLimit}
                maxLength={5}
                disabled={saving}
                value={v.value}
                aria-invalid={error?.field === "value" || undefined}
                aria-describedby={errorId("value")}
                onChange={(e) => {
                  set({ ...v, value: Number(e.target.value) });
                  E(null);
                }}
              />
              {errorText("value")}
            </Field>
            <Field label="单位">
              <input
                aria-label="单位"
                aria-description={`最多${textLimits.unit}个字符`}
                maxLength={textLimits.unit}
                disabled={saving}
                value={v.unit}
                onChange={(e) => set({ ...v, unit: e.target.value })}
              />
            </Field>
          </div>
          <details
            className="meter-range"
            open={rangeOpen}
            onToggle={(e) => RangeOpen(e.currentTarget.open)}
          >
            <summary>
              <span>设置数值范围</span>
              <small>{rangeText}</small>
            </summary>
            <div className="meter-range-fields">
              <Field label="最低值">
                <NumberInput
                  allowEmpty
                  step="1"
                  min={-meterLimit}
                  max={meterLimit}
                  maxLength={5}
                  disabled={saving}
                  value={v.min ?? ""}
                  aria-invalid={error?.field === "range" || undefined}
                  aria-describedby={errorId("range")}
                  onChange={(e) => {
                    set({
                      ...v,
                      min:
                        e.target.value === "" ? null : Number(e.target.value),
                    });
                    E(null);
                  }}
                />
              </Field>
              <Field label="最高值">
                <NumberInput
                  allowEmpty
                  step="1"
                  min={-meterLimit}
                  max={meterLimit}
                  maxLength={5}
                  disabled={saving}
                  value={v.max ?? ""}
                  aria-invalid={error?.field === "range" || undefined}
                  aria-describedby={errorId("range")}
                  onChange={(e) => {
                    set({
                      ...v,
                      max:
                        e.target.value === "" ? null : Number(e.target.value),
                    });
                    E(null);
                  }}
                />
              </Field>
            </div>
            {errorText("range")}
          </details>
        </div>
        {errorText("save")}
        <footer className="dialog-actions meter-form-actions">
          <button type="button" disabled={saving} onClick={close}>
            取消
          </button>
          <button className="primary" disabled={saving}>
            {saving ? "正在保存…" : "保存数值"}
          </button>
        </footer>
        {initial && (
          <>
            <p className="help meter-edit-help">
              改单位只改标识；旧行动仍保留当时结算。
            </p>
            <button
              type="button"
              disabled={saving}
              className="text-button danger meter-delete"
              onClick={async () => {
                if (await remove(v.id)) close();
              }}
            >
              删除数值
            </button>
          </>
        )}
      </form>
    </Dialog>
  );
}
