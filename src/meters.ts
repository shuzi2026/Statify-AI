import { meterRules } from "../shared/rules/actions";
import type { Meter } from "./model";

export const meterLimit = meterRules.absoluteLimit;
export const isManualMeterChange = (kind: string) => /^(手动数值|Manual value)$/.test(kind);
// Saved entries use their actual range and unit. Only a new candidate with an
// empty unit reserves one unit character; new forms explicitly start at -99/99.
export const meterZoneWidth = 0.918,
  meterGap = 0.018,
  meterControlWidth = 0.0975;
type MeterSize = Pick<Meter, "name" | "unit"> &
  Partial<Pick<Meter, "value" | "min" | "max">>;
export function meterWidth(m: MeterSize, unitReserve = 0) {
  const values = [m.value, m.min, m.max].filter(
    (n): n is number => n != null && Number.isFinite(n),
  );
  const digits = Math.max(
      1,
      ...values.map(
        (n) => String(Math.min(meterLimit, Math.abs(Math.round(n)))).length,
      ),
    ),
    sign = values.some((n) => n < 0) ? 1 : 0;
  const units = Math.max(unitReserve, Math.min(6, Array.from(m.unit).length));
  return Math.min(
    meterZoneWidth - meterControlWidth - meterGap,
    0.03 * Math.min(12, Array.from(m.name.trim()).length) +
      0.026 * units +
      0.034 * 0.65 * (digits + sign) +
      0.046 +
      0.009 * (units ? 2 : 1),
  );
}
export function meterPacking(meters: MeterSize[], newIndex = -1) {
  let row = 0,
    x = 0;
  const slots = [
    ...meters.map((m, i) => meterWidth(m, i === newIndex ? 1 : 0)),
    meterControlWidth,
  ].map((width) => {
    if (x && x + width > meterZoneWidth + 1e-8) {
      row++;
      x = 0;
    }
    const slot = { row, x, width };
    x += width + meterGap;
    return slot;
  });
  return { fits: row < 2, slots, rows: row + 1 };
}
export function checkMeterCapacity(meters: Meter[], next: Meter) {
  const old = meters.find((m) => m.id === next.id);
  const proposed = old
    ? meters.map((m) => (m.id === next.id ? next : m))
    : [...meters, next];
  if (!meterPacking(proposed, old ? -1 : proposed.length - 1).fits)
    throw Error("内容将超过自定义数值面板");
}
export function meterBounds(m: Pick<Meter, "min" | "max">) {
  const bound = (n: number) =>
    Math.max(-meterLimit, Math.min(meterLimit, Math.round(n)));
  return { min: bound(m.min ?? -meterLimit), max: bound(m.max ?? meterLimit) };
}
export function meterDisplay(value: number) {
  return Math.abs(value) > meterLimit ? "超限" : String(Math.round(value));
}
