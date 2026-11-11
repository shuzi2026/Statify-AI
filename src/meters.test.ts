import { ruleContext } from "./payments/access";
import { describe, it, expect } from "vitest";
import {
  meterWidth,
  meterPacking,
  checkMeterCapacity,
  meterBounds,
  meterDisplay,
} from "./meters";
import { fresh, newCard, type Meter } from "./model";
import { start, settle } from "./engine";
const meter = (i: number): Meter => ({
  id: String(i),
  name: "值" + i,
  unit: "",
  value: 0,
  precision: 0,
  min: null,
  max: null,
});
describe("two-row custom values", () => {
  it("uses one digit for a saved 0-9 range and no default unit or sign", () => {
    const one = { ...meter(0), min: 0, max: 9 },
      two = { ...meter(0), min: -99, max: 99 };
    expect(meterWidth(one)).toBeLessThan(meterWidth(two));
    expect(meterWidth({ ...one, unit: "%" })).toBeCloseTo(meterWidth(one, 1));
    expect(meterWidth(one, 1) - meterWidth(one)).toBeCloseTo(0.026 + 0.009);
    expect(meterWidth({ ...one, value: 9 })).toBe(meterWidth(one));
  });
  it("checks new or edited entries against the complete saved panel", () => {
    const old = Array.from({ length: 14 }, (_, i) => ({
      ...meter(i),
      min: 0,
      max: 9,
    }));
    expect(meterPacking(old).fits).toBe(false);
    expect(() => checkMeterCapacity(old, meter(20))).toThrow(
      "内容将超过自定义数值面板",
    );
    expect(() => checkMeterCapacity(old, { ...old[0], max: 99 })).toThrow(
      "内容将超过自定义数值面板",
    );
    expect(() =>
      checkMeterCapacity([], { ...meter(0), min: -99, max: 99 }),
    ).not.toThrow();
    expect(meterDisplay(10000)).toBe("超限");
    expect(meterDisplay(-9999)).toBe("-9999");
    expect(meterBounds({ min: 10000, max: 20000 })).toEqual({
      min: 9999,
      max: 9999,
    });
  });
  it("does not run a form capacity rejection during automatic settlement", () => {
    const s = fresh(Date.now(), "cn"),
      c = {
        ...newCard(Date.now()),
        name: "测试",
        method: "instant" as const,
        values: [{ id: "5", amount: 1000 }],
      };
    s.cards = [c];
    s.meters = Array.from({ length: 14 }, (_, i) => ({
      ...meter(i),
      value: 99,
    }));
    const id = start(s, c.id, Date.now()),
      e = settle(s, id, {
        seconds: 0,
        quantity: 1,
        rating: 1,
        counted: true,
        note: "",
      }, ruleContext(Date.now()));
    expect(s.meters[5].value).toBe(1099);
    expect(e.values[0].actual).toBe(1000);
    expect(e.values[0].reason).toBe("");
  });
  it.each([1, -1])(
    "clamps actual task settlement at signed four-digit bounds (%s)",
    (sign) => {
      const s = fresh(Date.now(), "cn"),
        c = {
          ...newCard(Date.now()),
          name: "测试",
          method: "instant" as const,
          values: [{ id: "0", amount: sign * 20 }],
        };
      s.meters = [{ ...meter(0), value: sign * 9998 }];
      s.cards = [c];
      const id = start(s, c.id, Date.now()),
        e = settle(s, id, {
          seconds: 0,
          quantity: 1,
          rating: 1,
          counted: true,
          note: "",
        }, ruleContext(Date.now()));
      expect(s.meters[0].value).toBe(sign * 9999);
      expect(e.values[0].actual).toBe(sign);
      expect(e.values[0].reason).toBe("已达数值边界");
    },
  );
});
