import { expect, it } from "vitest";
import { z } from "zod";
import { CardSchema } from "../shared/save-schema";

// GHSA-mrhx-c7xc-m3w5: a collection limit must reject before walking
// invalid elements. Seven synthetic rewards reproduce this without a load test.
it.each(["sync", "async"] as const)(
  "rejects oversized card rewards before reading their fields (%s)",
  async (mode) => {
    let reads = 0;
    const rewards = Array.from({ length: 7 }, () => ({
      get id() {
        reads++;
        return "";
      },
      amount: "invalid",
    }));
    const schema = CardSchema.shape.rewards;
    const result =
      mode === "sync"
        ? schema.safeParse(rewards)
        : await schema.safeParseAsync(rewards);

    expect(result.success).toBe(false);
    expect(reads).toBe(0);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0]).toMatchObject({
        code: "too_big",
        path: [],
      });
    }
  },
);

it("keeps valid rewards and rejects an invalid field within the limit", () => {
  const rewards = [
    { id: "synthetic-attribute-1", amount: 2 },
    { id: "synthetic-attribute-2", amount: 0 },
  ];
  expect(CardSchema.shape.rewards.parse(rewards)).toEqual(rewards);
  const invalid = CardSchema.shape.rewards.safeParse([
    { id: "synthetic-attribute-1", amount: "invalid" },
  ]);
  expect(invalid.success).toBe(false);
  if (!invalid.success) {
    expect(invalid.error.issues[0]).toMatchObject({
      code: "invalid_type",
      path: [0, "amount"],
    });
  }
});

it.each([
  [
    "map",
    () => z.map(z.string(), z.number()).max(1),
    () =>
      new Map([
        [1, "bad"],
        [2, "bad"],
      ]),
  ],
  ["set", () => z.set(z.string()).max(1), () => new Set([1, 2])],
] as const)(
  "rejects an oversized %s with only the size issue",
  (_name, schema, input) => {
    const result = schema().safeParse(input());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0]).toMatchObject({
        code: "too_big",
        path: [],
      });
    }
  },
);
