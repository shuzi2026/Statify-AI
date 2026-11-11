import { afterEach, expect, it, vi } from "vitest";
const bridge = vi.hoisted(() => ({
  platform: "web",
  request: vi.fn(),
  openCheckout: vi.fn(),
  addListener: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => bridge.platform },
  registerPlugin: () => bridge,
}));
import {
  paymentRequest,
  openPaymentCheckout,
  onPaymentResume,
} from "./transport";
afterEach(() => {
  bridge.platform = "web";
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("GET retries one transient failure, but never replays a POST or an authentication/conflict response", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({}, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetch);
  expect((await paymentRequest("/orders")).status).toBe(200);
  expect(fetch).toHaveBeenCalledTimes(2);
  for (const status of [401, 403, 409, 429]) {
    fetch.mockClear().mockResolvedValue(Response.json({}, { status }));
    expect((await paymentRequest("/orders")).status).toBe(status);
    expect(fetch).toHaveBeenCalledOnce();
  }
  fetch.mockClear().mockResolvedValue(Response.json({}, { status: 503 }));
  expect((await paymentRequest("/orders", {})).status).toBe(503);
  expect(fetch).toHaveBeenCalledOnce();
  fetch.mockClear().mockRejectedValue(new TypeError("network"));
  await expect(paymentRequest("/codes/redeem", {})).rejects.toMatchObject({
    kind: "network",
    mayHaveSucceeded: true,
  });
  expect(fetch).toHaveBeenCalledOnce();
});
it("cancellation aborts fetch and rejects a late body without treating it as a network failure", async () => {
  let finish!: (value: unknown) => void;
  const fetch = vi.fn().mockResolvedValue({
    status: 200,
    json: () =>
      new Promise((r) => {
        finish = r;
      }),
  });
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController(),
    result = paymentRequest("/me", undefined, { signal: controller.signal });
  const check = expect(result).rejects.toMatchObject({
    kind: "cancelled",
    mayHaveSucceeded: false,
  });
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  controller.abort();
  await check;
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  finish({ account: { id: "late" } });
  expect(fetch).toHaveBeenCalledOnce();
});
it("the total deadline includes JSON parsing and distinguishes timeout from malformed JSON", async () => {
  vi.useFakeTimers();
  const fetch = vi
    .fn()
    .mockResolvedValue({ status: 200, json: () => new Promise(() => {}) });
  vi.stubGlobal("fetch", fetch);
  const check = expect(
    paymentRequest("/me", undefined, { timeoutMs: 30 }),
  ).rejects.toMatchObject({ kind: "timeout" });
  await vi.advanceTimersByTimeAsync(30);
  await check;
  fetch.mockResolvedValue({
    status: 200,
    json: () => Promise.reject(new SyntaxError()),
  });
  await expect(paymentRequest("/me")).rejects.toMatchObject({
    kind: "invalid-response",
  });
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("config shares only concurrent loads and one waiter cannot cancel the others", async () => {
  let finish!: (value: Response) => void;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((r) => {
        finish = r;
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  const first = paymentRequest("/config", undefined, {
      signal: controller.signal,
    }),
    second = paymentRequest("/config");
  const cancelled = expect(first).rejects.toMatchObject({ kind: "cancelled" });
  controller.abort();
  await cancelled;
  expect(fetch).toHaveBeenCalledOnce();
  expect(
    (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].signal
      ?.aborted,
  ).toBe(false);
  finish(Response.json({ region: "cn" }));
  expect((await second).data).toEqual({ region: "cn" });
  const next = paymentRequest("/config");
  expect(fetch).toHaveBeenCalledTimes(2);
  finish(Response.json({ region: "cn" }));
  await next;
});
it("the last config waiter cancels the underlying load and a later caller starts fresh", async () => {
  const fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  const check = expect(
    paymentRequest("/config", undefined, { signal: controller.signal }),
  ).rejects.toMatchObject({ kind: "cancelled" });
  controller.abort();
  await check;
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  fetch.mockResolvedValue(Response.json({ ok: true }));
  await paymentRequest("/config");
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("native cancellation stops waiting without inventing a cancel API or replaying a write", async () => {
  bridge.platform = "android";
  let finish!: (result: unknown) => void;
  bridge.request.mockImplementation(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const controller = new AbortController();
  const check = expect(
    paymentRequest("/auth/login", {}, { signal: controller.signal }),
  ).rejects.toMatchObject({ kind: "cancelled", mayHaveSucceeded: true });
  controller.abort();
  await check;
  finish({ status: 200, data: { ok: true } });
  expect(bridge.request).toHaveBeenCalledOnce();
});
it("pre-cancelled or invalid requests cannot reach either credential transport", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  controller.abort();
  await expect(
    paymentRequest("/auth/login", {}, { signal: controller.signal }),
  ).rejects.toMatchObject({ kind: "cancelled", mayHaveSucceeded: false });
  for (const path of [
    "https://example.test/me",
    "//host/me",
    "/../me",
    "/me#fragment",
  ])
    await expect(paymentRequest(path)).rejects.toMatchObject({
      kind: "configuration",
    });
  expect(fetch).not.toHaveBeenCalled();
});
it("a failed read stops after one retry and the total deadline also bounds retry waiting", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockRejectedValue(new TypeError("network"));
  vi.stubGlobal("fetch", fetch);
  const exhausted = expect(paymentRequest("/me")).rejects.toMatchObject({
    kind: "network",
  });
  await vi.advanceTimersByTimeAsync(201);
  await exhausted;
  expect(fetch).toHaveBeenCalledTimes(2);
  fetch.mockClear();
  const timed = expect(
    paymentRequest("/me", undefined, { timeoutMs: 30 }),
  ).rejects.toMatchObject({ kind: "timeout" });
  await vi.advanceTimersByTimeAsync(30);
  await timed;
  await vi.advanceTimersByTimeAsync(300);
  expect(fetch).toHaveBeenCalledOnce();
});
it("native writes time out without repeating, and a rejected config load never poisons the next load", async () => {
  vi.useFakeTimers();
  bridge.platform = "android";
  bridge.request.mockImplementationOnce(() => new Promise(() => {}));
  const timeout = expect(
    paymentRequest("/cloud/sync", {}, { timeoutMs: 30 }),
  ).rejects.toMatchObject({ kind: "timeout", mayHaveSucceeded: true });
  await vi.advanceTimersByTimeAsync(30);
  await timeout;
  expect(bridge.request).toHaveBeenCalledOnce();
  bridge.platform = "web";
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      status: 200,
      json: () => Promise.reject(new SyntaxError()),
    })
    .mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetch);
  await expect(paymentRequest("/config")).rejects.toMatchObject({
    kind: "invalid-response",
  });
  expect((await paymentRequest("/config")).data).toEqual({ ok: true });
  expect(fetch).toHaveBeenCalledTimes(2);
});
it.each([
  ["此安装包尚未配置会员服务器", "configuration"],
  ["This build has no membership server configured", "configuration"],
  ["Invalid membership request path", "configuration"],
  ["会员服务未返回结果", "invalid-response"],
])(
  "normalizes the existing native failure %s without retry or cookie access",
  async (message, kind) => {
    bridge.platform = "android";
    bridge.request.mockRejectedValueOnce(Error(message));
    await expect(paymentRequest("/config")).rejects.toMatchObject({ kind });
    expect(bridge.request).toHaveBeenCalledOnce();
  },
);

it("Android uses the native credential boundary instead of web fetch or exposing cookies", async () => {
  bridge.platform = "android";
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  bridge.request.mockResolvedValue({
    status: 200,
    data: { account: { id: "alice" } },
  });
  expect(
    await paymentRequest("/auth/login", {
      username: "alice",
      password: "long enough password",
    }),
  ).toEqual({ status: 200, data: { account: { id: "alice" } } });
  expect(bridge.request).toHaveBeenCalledWith({
    path: "/auth/login",
    body: JSON.stringify({
      username: "alice",
      password: "long enough password",
    }),
  });
  expect(fetch).not.toHaveBeenCalled();
});
it("checkout rejects other hosts, mismatched environments, embedded credentials and extra ports", async () => {
  bridge.platform = "android";
  for (const url of [
    "http://www.paypal.com/checkoutnow",
    "https://www.paypal.com.evil.test/",
    "https://www.sandbox.paypal.com/checkoutnow",
    "https://attacker@www.paypal.com/",
    "https://www.paypal.com:8443/",
  ]) {
    await expect(openPaymentCheckout(url, "live")).rejects.toThrow(
      "支付地址不正确",
    );
  }
  expect(bridge.openCheckout).not.toHaveBeenCalled();
  await openPaymentCheckout(
    "https://www.paypal.com/checkoutnow?token=test",
    "live",
  );
  expect(bridge.openCheckout).toHaveBeenCalledWith({
    url: "https://www.paypal.com/checkoutnow?token=test",
  });
});
it("a native resume listener completed after disposal is removed and cannot refresh an unmounted app", async () => {
  bridge.platform = "android";
  let finish!: (handle: { remove: () => Promise<void> }) => void;
  let callback!: () => void;
  bridge.addListener.mockImplementation((_event: string, fn: () => void) => {
    callback = fn;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const refresh = vi.fn(),
    remove = vi.fn().mockResolvedValue(undefined),
    dispose = onPaymentResume(refresh);
  dispose();
  callback();
  finish({ remove });
  await Promise.resolve();
  expect(refresh).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalledOnce();
});
it("native listener cleanup is idempotent and a rejected removal stays in diagnostics", async () => {
  bridge.platform = "android";
  const remove = vi.fn().mockRejectedValue(Error("native cleanup"));
  bridge.addListener.mockResolvedValueOnce({ remove });
  const stop = onPaymentResume(vi.fn());
  await Promise.resolve();
  stop();
  stop();
  await new Promise((r) => setTimeout(r, 0));
  expect(remove).toHaveBeenCalledOnce();
  expect(
    (await import("../runtime-diagnostics"))
      .runtimeIssues()
      .some((issue) => issue.kind === "initialization"),
  ).toBe(true);
});
