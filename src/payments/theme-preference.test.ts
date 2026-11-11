import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({
  id: "account-a" as string | null,
  theme: "peach",
  account: new Set<() => void>(),
  choice: new Set<() => void>(),
  request: vi.fn(),
}));
vi.mock("./cn-account", () => ({
  getCnAccount: () => ({ account: mock.id ? { id: mock.id } : null }),
  subscribeCnAccount: (fn: () => void) => {
    mock.account.add(fn);
    return () => mock.account.delete(fn);
  },
}));
vi.mock("./deployment", () => ({ cnAccountBackend: true, localOnly: false }));
vi.mock("../themes/runtime", () => ({
  storedThemeChoice: () => mock.theme,
  subscribeThemeChoice: (fn: () => void) => {
    mock.choice.add(fn);
    return () => mock.choice.delete(fn);
  },
}));
vi.mock("./transport", () => ({ paymentRequest: mock.request }));
import { startThemePreferenceSync } from "./theme-preference";
let stop: (() => void) | undefined;
const emit = () => mock.choice.forEach((fn) => fn());
const ack = (id: string, theme: string) => ({
  status: 200,
  data: { account_id: id, preference: { theme_id: theme } },
});
beforeEach(() => {
  const values = new Map();
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => values.get(k) || null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  });
  mock.account.clear();
  mock.choice.clear();
  mock.id = "account-a";
  mock.theme = "peach";
  mock.request.mockReset();
});
afterEach(() => {
  stop?.();
  vi.unstubAllGlobals();
});
it("keeps a failed device choice and retries on network recovery without touching account licenses", async () => {
  mock.request
    .mockRejectedValueOnce(Error("offline"))
    .mockResolvedValue(ack("account-a", "peach"));
  stop = startThemePreferenceSync();
  await vi.waitFor(() => expect(mock.request).toHaveBeenCalledTimes(1));
  window.dispatchEvent(new Event("online"));
  await vi.waitFor(() =>
    expect(localStorage.getItem("statify-theme-synced:account-a")).toBe(
      "peach",
    ),
  );
  expect(mock.request).toHaveBeenLastCalledWith(
    "/preferences",
    {
      theme_id: "peach",
      expected_account_id: "account-a",
    },
    { signal: expect.any(AbortSignal) },
  );
});
it("serializes rapid theme changes and does not let an old acknowledgment swallow the newest choice", async () => {
  let resolve!: (value: unknown) => void;
  mock.request
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    )
    .mockImplementation(
      (
        _path: string,
        body: { theme_id: string; expected_account_id: string },
      ) => Promise.resolve(ack(body.expected_account_id, body.theme_id)),
    );
  stop = startThemePreferenceSync();
  mock.theme = "raven-wizard";
  emit();
  resolve(ack("account-a", "peach"));
  await vi.waitFor(() =>
    expect(localStorage.getItem("statify-theme-synced:account-a")).toBe(
      "raven-wizard",
    ),
  );
  expect(mock.request).toHaveBeenCalledTimes(2);
});
it("ignores an old account response and records the new account independently", async () => {
  let resolve!: (value: unknown) => void;
  mock.request
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    )
    .mockResolvedValue(ack("account-b", "peach"));
  stop = startThemePreferenceSync();
  mock.id = "account-b";
  mock.account.forEach((fn) => fn());
  resolve(ack("account-a", "peach"));
  await vi.waitFor(() =>
    expect(localStorage.getItem("statify-theme-synced:account-b")).toBe(
      "peach",
    ),
  );
  expect(localStorage.getItem("statify-theme-synced:account-a")).toBe(null);
});
it("does not submit anonymously and allows an explicit repeated choice to update the server record", async () => {
  mock.id = null;
  stop = startThemePreferenceSync();
  expect(mock.request).not.toHaveBeenCalled();
  mock.id = "account-a";
  mock.request.mockResolvedValue(ack("account-a", "peach"));
  mock.account.forEach((fn) => fn());
  await vi.waitFor(() =>
    expect(localStorage.getItem("statify-theme-synced:account-a")).toBe(
      "peach",
    ),
  );
  emit();
  await vi.waitFor(() => expect(mock.request).toHaveBeenCalledTimes(2));
});
