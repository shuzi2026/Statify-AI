import { type PluginListenerHandle } from "@capacitor/core";
import { globalAppBackend } from "./deployment";
import {
  paymentsBridge as native,
  hasAndroidBridge as android,
} from "../platform/native";
import { platformCapabilities } from "../platform/runtime";
import {
  diagnosticRequestId,
  recordRuntimeIssue,
} from "../runtime-diagnostics";
import {
  PaymentRequestError,
  assertRequestActive,
  type RequestOptions,
} from "./request-policy";

function apiBase() {
  return platformCapabilities().api.path;
}
type Result = { status: number; data: unknown };
const transient = new Set([408, 500, 502, 503, 504]);
async function requestImpl(
  path: string,
  body: unknown,
  options: RequestOptions,
): Promise<Result> {
  assertRequestActive(options.signal);
  const capability = platformCapabilities();
  if (capability.issues.length || capability.api.transport === "unimplemented")
    throw new PaymentRequestError("configuration");
  // Never accept arbitrary origins, redirects or traversal through this credential boundary.
  if (
    !/^\/[a-z0-9][a-z0-9/-]*(?:\?[^#\\]*)?$/i.test(path) ||
    path.includes("..")
  )
    throw new PaymentRequestError("configuration");
  const isNative = android(),
    write = body !== undefined;
  const timeoutMs =
    options.timeoutMs ??
    (isNative ? (path.startsWith("/cloud") ? 80000 : 40000) : 20000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120000)
    throw new PaymentRequestError("configuration");
  let serialized: string | undefined;
  try {
    serialized = write ? JSON.stringify(body) : undefined;
    if (write && serialized === undefined)
      throw new PaymentRequestError("configuration");
  } catch {
    throw new PaymentRequestError("configuration");
  }
  const controller = new AbortController();
  let failure: PaymentRequestError | undefined,
    dispatched = false;
  let rejectStop!: (error: PaymentRequestError) => void;
  const stopped = new Promise<never>((_, reject) => {
    rejectStop = reject;
  });
  const stop = (kind: "timeout" | "cancelled") => {
    if (failure) return;
    failure = new PaymentRequestError(kind, write && dispatched);
    rejectStop(failure);
    controller.abort();
  };
  const abort = () => stop("cancelled");
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => stop("timeout"), timeoutMs);
  // Race the complete operation, including body parsing and the native bridge. The
  // bridge has no cancel API: a late native completion is observed but never adopted.
  const attempt = async (): Promise<Result> => {
    if (failure) throw failure;
    dispatched = true;
    if (isNative) {
      try {
        return await native.request({
          path,
          ...(write ? { body: serialized } : {}),
        });
      } catch (error) {
        // Older bridges expose fixed localized messages, not structured codes.
        // Unknown native exceptions remain opaque network failures.
        const message = (error as { message?: unknown })?.message;
        if (
          [
            "此安装包尚未配置会员服务器",
            "This build has no membership server configured",
            "会员请求地址不正确",
            "Invalid membership request path",
            "请求过大",
            "Request is too large",
          ].includes(message as string)
        )
          throw new PaymentRequestError("configuration");
        if (
          [
            "会员服务尚未就绪，请稍后重试",
            "Membership service is not ready. Try again later.",
            "会员服务未返回结果",
            "Membership service returned no result",
          ].includes(message as string)
        )
          throw new PaymentRequestError("invalid-response", write);
        throw error;
      }
    }
    const response = await fetch(apiBase() + path, {
      method: write ? "POST" : "GET",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: write ? { "Content-Type": "application/json" } : {},
      ...(write ? { body: serialized } : {}),
      signal: controller.signal,
    });
    try {
      return { status: response.status, data: await response.json() };
    } catch {
      throw failure || new PaymentRequestError("invalid-response", write);
    }
  };
  let delay: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    for (let tries = 0; ; tries++) {
      try {
        const result = await attempt();
        if (failure) throw failure;
        if (
          !Number.isInteger(result?.status) ||
          result.status < 100 ||
          result.status > 599
        )
          throw new PaymentRequestError("invalid-response", write);
        if (write || tries > 0 || !transient.has(result.status)) return result;
      } catch (error) {
        const classified =
          failure ||
          (error instanceof PaymentRequestError
            ? error
            : new PaymentRequestError("network", write && dispatched));
        if (write || tries > 0 || classified.kind !== "network")
          throw classified;
      }
      await Promise.race([
        new Promise<void>((resolve) => {
          delay = setTimeout(resolve, 200);
        }),
        stopped,
      ]);
    }
  };
  try {
    return await Promise.race([run(), stopped]);
  } finally {
    clearTimeout(timer);
    clearTimeout(delay);
    options.signal?.removeEventListener("abort", abort);
  }
}
async function observedRequest(
  path: string,
  body: unknown,
  options: RequestOptions,
) {
  const requestId = diagnosticRequestId(),
    began = performance.now();
  try {
    const result = await requestImpl(path, body, options);
    if (result.status >= 400)
      recordRuntimeIssue("api", new Error("http:" + result.status), {
        requestId,
        durationMs: performance.now() - began,
        status: result.status,
        category: "http",
      });
    return result;
  } catch (error) {
    if (!(error instanceof PaymentRequestError && error.kind === "cancelled"))
      recordRuntimeIssue("api", error, {
        requestId,
        durationMs: performance.now() - began,
        category:
          error instanceof PaymentRequestError
            ? error.kind === "timeout"
              ? "TimeoutError"
              : error.kind === "invalid-response"
                ? "invalid-json"
                : error.kind
            : "network",
      });
    throw error;
  }
}
type ConfigFlight = {
  controller: AbortController;
  promise: Promise<Result>;
  waiters: number;
};
const configs = new Map<string, ConfigFlight>();
export async function paymentRequest(
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<Result> {
  assertRequestActive(options.signal);
  if (path !== "/config" || body !== undefined)
    return observedRequest(path, body, options);
  const key = `${android()}:${apiBase()}:${options.timeoutMs ?? "default"}`;
  let flight = configs.get(key);
  if (!flight) {
    const controller = new AbortController();
    flight = {
      controller,
      waiters: 0,
      promise: observedRequest(path, undefined, {
        ...options,
        signal: controller.signal,
      }),
    };
    configs.set(key, flight);
    const current = flight;
    const remove = () => {
      if (configs.get(key) === current) configs.delete(key);
    };
    void flight.promise.then(remove, remove);
  }
  const current = flight;
  current.waiters++;
  return new Promise<Result>((resolve, reject) => {
    let done = false;
    const finish = (result?: Result, error?: unknown) => {
      if (done) return;
      done = true;
      options.signal?.removeEventListener("abort", abort);
      if (--current.waiters === 0) {
        if (configs.get(key) === current) configs.delete(key);
        current.controller.abort();
      }
      if (error) reject(error);
      else resolve(result!);
    };
    const abort = () => finish(undefined, new PaymentRequestError("cancelled"));
    options.signal?.addEventListener("abort", abort, { once: true });
    void current.promise.then(
      (result) => finish(result),
      (error) => finish(undefined, error),
    );
  });
}
export async function readOfflineAccount() {
  const capability = platformCapabilities();
  if (capability.native.accountStorage === "unimplemented") return "";
  return android()
    ? (await native.readAccountLicense()).value
    : localStorage.getItem(capability.data.offlineAccountKey) || "";
}
export async function writeOfflineAccount(value: string) {
  const capability = platformCapabilities();
  if (capability.native.accountStorage === "unimplemented")
    throw new PaymentRequestError("configuration");
  const offlineKey = capability.data.offlineAccountKey;
  if (android()) await native.writeAccountLicense({ value });
  else if (value) localStorage.setItem(offlineKey, value);
  else localStorage.removeItem(offlineKey);
}
export async function clearCnSession() {
  if (android()) await native.clearCnAccountSession();
}

export async function openPaymentCheckout(
  value: string,
  environment: "sandbox" | "live",
) {
  const capability = platformCapabilities();
  if (capability.issues.length || capability.payment === "unimplemented")
    throw new PaymentRequestError("configuration");
  const url = new URL(value),
    host = environment === "live" ? "www.paypal.com" : "www.sandbox.paypal.com";
  if (
    url.protocol !== "https:" ||
    url.hostname !== host ||
    url.username ||
    url.password ||
    url.port
  )
    throw Error("支付地址不正确");
  if (android()) await native.openCheckout({ url: url.href });
  else if (globalAppBackend) window.location.assign(url.href);
  else window.open(url.href, "_blank", "noopener,noreferrer");
}

export function onPaymentResume(callback: () => void) {
  let disposed = false,
    handle: PluginListenerHandle | undefined;
  const remove = (value: PluginListenerHandle) => {
    void value
      .remove()
      .catch((error) => recordRuntimeIssue("initialization", error));
  };
  if (android())
    void native
      .addListener("resume", () => {
        if (!disposed) callback();
      })
      .then((value) => {
        if (disposed) remove(value);
        else handle = value;
      })
      .catch(() => {});
  return () => {
    if (disposed) return;
    disposed = true;
    if (handle) remove(handle);
  };
}
