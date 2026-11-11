import { afterEach, expect, it, vi } from "vitest";
import * as current from "./model";
import baseline from "../tests/fixtures/foundation-baseline.json";
import * as text from "./text-limits";
const at = baseline.fresh.createdAt;
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});
it("preserves complete new-save, card and starter-template defaults", () => {
  vi.spyOn(crypto, "randomUUID").mockReturnValue(
    "00000000-0000-4000-8000-000000000001",
  );
  vi.spyOn(Date, "now").mockReturnValue(at);
  expect(current.fresh(at, "cn")).toEqual(baseline.fresh);
  expect(current.newCard(at)).toEqual(baseline.newCard);
  expect(current.templates(Date.now())).toEqual(baseline.templates);
  expect(current.StateSchema.parse(current.fresh(at, "cn"))).toEqual(
    baseline.parsedFresh,
  );
});
it("keeps every factory result independent of other calls", () => {
  const a = current.fresh(at, "cn"),
    b = current.fresh(at, "cn");
  a.preferences!.rewardPerUnitMax = 20;
  a.attributes[0].daily.today = 9;
  expect(b.preferences!.rewardPerUnitMax).toBe(100);
  expect(b.attributes[0].daily).toEqual({});
  const first = current.templates(Date.now());
  first[0].rewards[0].amount = 999;
  expect(current.templates(Date.now())[0].rewards[0].amount).toBe(100);
});
it.each(["0.2.1", "0.2.2"])(
  "retains legacy schema normalization and missing defaults (%s)",
  (version) => {
    const save = { ...current.fresh(at, "cn"), version } as Record<string, unknown>;
    for (const field of [
      "preferences",
      "region",
      "planMode",
      "cardTemplates",
      "planCycles",
      "messages",
    ])
      delete save[field];
    expect(current.StateSchema.parse(save)).toEqual(baseline.parsedFresh);
  },
);
it("still loads historical card names beyond the printable title width", () => {
  const card = { ...current.newCard(at), name: "旧".repeat(100) };
  expect(current.CardSchema.parse(card)).toEqual(card);
});
it.each(baseline.text)("preserves the display width estimate and generic field limits for $value", (row) => {
  const value = row.value;
  expect(text.cardNameWidth(value)).toBe(row.width);
  const result = (fn: () => void) => {
    try {
      fn();
      return "accepted";
    } catch (e) {
      return (e as Error).message;
    }
  };
  expect(result(() => text.checkTextLength(value, 8, "名称"))).toBe(row.length);
});
it.each([119, 120, 121])("preserves stored message boundary %s", (length) => {
  const card = {
    ...current.newCard(at),
    name: "测试",
    message: "a".repeat(length),
  };
  expect(current.CardSchema.safeParse(card).success).toBe(length <= 120);
});
it.each([3999, 4000, 4001])(
  "preserves stored draft note boundary %s",
  (length) => {
    const save = current.fresh(at, "cn");
    save.actions = [
      {
        id: "action",
        card: { ...current.newCard(at), name: "测试" },
        startedAt: at,
        elapsed: 0,
        runningSince: null,
        endedAt: at,
        status: {},
        coefficient: 1,
        plans: [],
        draft: {
          seconds: 0,
          quantity: 1,
          rating: 1,
          counted: true,
          note: "a".repeat(length),
        },
      },
    ];
    expect(current.StateSchema.safeParse(save).success).toBe(length <= 4000);
  },
);
it.each([
  {
    region: "cn",
    environment: "sandbox",
    backend: "cn-postgres",
    global: false,
    cn: true,
  },
  {
    region: "global",
    environment: "live",
    backend: "global-postgres",
    global: true,
    cn: false,
  },
  {
    region: "cn",
    environment: "sandbox",
    backend: "legacy-payments",
    global: false,
    cn: false,
  },
])(
  "preserves regional isolation: $region/$environment/$backend",
  async (row) => {
    vi.stubEnv("VITE_STATIFY_REGION", row.region);
    vi.stubEnv("VITE_STATIFY_PAYMENT_ENV", row.environment);
    vi.stubEnv("VITE_STATIFY_ACCOUNT_BACKEND", row.backend);
    vi.resetModules();
    const target = await import("./payments/deployment");
    expect(target.paymentRegion).toBe(row.region);
    expect(target.paymentEnvironment).toBe(row.environment);
    expect(target.globalAppBackend).toBe(row.global);
    expect(target.cnAccountBackend).toBe(row.cn);
  },
);
it("does not allow production URL query to select the international region", async () => {
  vi.stubEnv("DEV", false);
  vi.stubEnv("VITE_STATIFY_REGION", "cn");
  vi.stubGlobal("location", { search: "?region=global" });
  vi.resetModules();
  expect((await import("./payments/deployment")).paymentRegion).toBe("cn");
});
