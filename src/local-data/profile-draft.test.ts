import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  readProfileDraft,
  writeProfileDraft,
  removeProfileDraft,
} from "./profile-draft";
let values: Map<string, string>;
const key = "life-rpg-profile-draft:123";
const draft = {
  step: 3,
  name: " 未完成昵称 ",
  age: 24,
  values: [10, 50.5, 80, 100],
  add: false,
};
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("restores original untrimmed inputs and extension fields without rewriting or adding an expiry", () => {
  const old = { ...draft, extra: "preserve existing format" };
  values.set(key, JSON.stringify(old));
  expect(readProfileDraft(123, 4)).toEqual(old);
  expect(readProfileDraft(124, 4)).toBeNull();
  expect(values.get(key)).toBe(JSON.stringify(old));
  expect(writeProfileDraft(123, old)).toBe("saved");
  expect(JSON.parse(values.get(key)!)).toEqual(old);
});

it("rejects malformed legacy input at the existing boundaries without deleting it", () => {
  for (const v of [
    null,
    {},
    { ...draft, step: 7 },
    { ...draft, step: 1.5 },
    { ...draft, name: "x".repeat(31) },
    { ...draft, age: 0 },
    { ...draft, age: 121 },
    { ...draft, values: [10, 20] },
    { ...draft, values: [0, 10, 20, 101] },
    { ...draft, add: 1 },
  ]) {
    const raw = JSON.stringify(v);
    values.set(key, raw);
    expect(readProfileDraft(123, 4)).toBeNull();
    expect(values.get(key)).toBe(raw);
  }
  values.set(key, "{");
  expect(readProfileDraft(123, 4)).toBeNull();
  for (const step of [0, 6]) {
    values.set(key, JSON.stringify({ ...draft, step, name: "", age: 1 }));
    expect(readProfileDraft(123, 4)?.step).toBe(step);
  }
});

it("storage failures leave live inputs and unrelated keys intact and cleanup remains best effort", () => {
  writeProfileDraft(123, draft);
  values.set("unrelated", "keep");
  const deny = () => {
    throw Error("Synthetic storage denial");
  };
  vi.spyOn(localStorage, "getItem").mockImplementation(deny);
  vi.spyOn(localStorage, "setItem").mockImplementation(deny);
  vi.spyOn(localStorage, "removeItem").mockImplementation(deny);
  expect(readProfileDraft(123, 4)).toBeNull();
  expect(writeProfileDraft(123, draft)).toBe("unavailable");
  expect(removeProfileDraft(123)).toBe("unavailable");
  expect(draft.name).toBe(" 未完成昵称 ");
  vi.restoreAllMocks();
  expect(readProfileDraft(123, 4)).toEqual(draft);
  expect(removeProfileDraft(123)).toBe("removed");
  expect(values.get("unrelated")).toBe("keep");
});
