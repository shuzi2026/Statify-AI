import { actionRules } from "../../shared/rules/actions";
import { NumberInput } from "../inputs/ValueInputs";
import { useEffect, useRef, useState } from "react";
import { type Action } from "../model";

export function ActionQuantity({
  action,
  change,
  busy = false,
}: {
  action: Action;
  change: (quantity: number) => void;
  busy?: boolean;
}) {
  const value = action.draft?.quantity ?? 1,
    [text, Text] = useState(String(value)),
    focused = useRef(false);
  useEffect(() => {
    if (!focused.current) Text(String(value));
  }, [value]);
  if (
    action.card.method !== "quantity" ||
    action.card.evaluate ||
    action.card.settle
  )
    return null;
  return (
    <label className="action-quantity">
      <span>数量{action.card.unit && "（" + action.card.unit + "）"}</span>
      <NumberInput
        aria-label={"本次数量（" + action.card.unit + "）"}
        min="1"
        max={actionRules.maxQuantity}
        step="1"
        value={text}
        disabled={busy || action.endedAt !== null}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => {
          Text(e.currentTarget.value);
          const n = Number(e.currentTarget.value);
          if (Number.isInteger(n) && n >= 1 && n <= actionRules.maxQuantity)
            change(n);
        }}
        onBlur={() => {
          focused.current = false;
          const n = Number(text);
          if (!Number.isInteger(n) || n < 1 || n > actionRules.maxQuantity)
            Text(String(value));
        }}
      />
    </label>
  );
}
