import { expect, it } from "vitest";
import { sameStoredValue } from "./storage-equality";
import { packState } from "./storage-format";
import { fresh, newCard } from "./model";

it("only bypasses serialization for equal persisted shapes, including nested and sparse arrays", () => {
  const values = [
    null,
    undefined,
    false,
    true,
    0,
    -0,
    1,
    "",
    "中文",
    [],
    [null],
    [undefined],
    Array(1),
    [1],
    [1, 2],
    [2, 1],
    {},
    { a: 1 },
    { a: undefined },
    { a: null },
    { a: 1, b: 2 },
    { b: 2, a: 1 },
    { rows: [{ note: "before", values: [{ actual: 1 }] }] },
    { rows: [{ note: "after", values: [{ actual: 1 }] }] },
    { rows: [{ note: "before", values: [{ actual: 2 }] }] },
  ];
  for (const a of values)
    for (const b of values)
      if (sameStoredValue(a, b))
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  expect(sameStoredValue(Array(1), [1])).toBe(false);
  expect(sameStoredValue([1], Array(1))).toBe(false);
  expect(sameStoredValue({ a: 1 }, { a: 1 })).toBe(true);
  expect(sameStoredValue({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(false);
  expect(sameStoredValue(new Date(0), new Date(1))).toBe(false);
  expect(sameStoredValue({ toJSON: () => 1 }, {})).toBe(false);
});

it("compares all stored fields and positions without mutating either row", () => {
  const state = fresh(Date.parse("2026-10-20T12:00:00Z"), "cn");
  state.cards = [newCard(state.createdAt)];
  const packed = packState(state);
  for (const row of Object.values(packed.rows).flat()) {
    const original = JSON.stringify(row),
      copy = structuredClone(row);
    expect(sameStoredValue(row, copy)).toBe(true);
    copy.position++;
    expect(sameStoredValue(row, copy)).toBe(false);
    expect(JSON.stringify(row)).toBe(original);
  }
});
