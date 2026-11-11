/** Shared error and cancellation contract; no account state or platform dependencies. */
export type RequestOptions = { signal?: AbortSignal; timeoutMs?: number };
export type RequestFailure =
  "cancelled" | "timeout" | "network" | "invalid-response" | "configuration";
export class PaymentRequestError extends Error {
  readonly name = "PaymentRequestError";
  constructor(
    public kind: RequestFailure,
    public mayHaveSucceeded = false,
  ) {
    super(
      kind === "cancelled"
        ? "The request was cancelled or the account changed."
        : kind === "timeout"
          ? "账号服务响应超时，请稍后重试。"
          : kind === "invalid-response"
            ? "会员服务尚未连接，请稍后重试"
            : kind === "configuration"
              ? "账号服务配置不正确。"
              : "暂时无法连接账号服务，请检查网络后重试。",
    );
    if (mayHaveSucceeded)
      this.message += " 操作可能已经完成，请先刷新状态再决定是否重试。";
  }
}
export class PaymentApiError extends Error {
  readonly name = "PaymentApiError";
  readonly kind: "session-expired" | "http";
  readonly details: { title?: string; code?: string; revision?: number };
  constructor(
    public status: number,
    details: unknown,
    sessionExpired = status === 401,
    fallbackMessage = "The request could not be completed.",
  ) {
    const value =
      details && typeof details === "object"
        ? (details as PaymentApiError["details"])
        : {};
    super(
      typeof value.title === "string" && value.title.trim()
        ? value.title
        : fallbackMessage,
    );
    this.details = value;
    this.kind = sessionExpired ? "session-expired" : "http";
  }
}
export const isRequestCancelled = (error: unknown) =>
  error instanceof PaymentRequestError && error.kind === "cancelled";
export function assertRequestActive(signal?: AbortSignal) {
  if (signal?.aborted) throw new PaymentRequestError("cancelled");
}
/** Unlike AbortSignal.any, also works on the existing older WebView baseline. */
export function linkRequestSignals(...signals: (AbortSignal | undefined)[]) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of signals) {
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", abort, { once: true });
  }
  return {
    signal: controller.signal,
    dispose: () =>
      signals.forEach((signal) => signal?.removeEventListener("abort", abort)),
  };
}
export function requestScope() {
  let controller = new AbortController();
  return {
    get signal() {
      return controller.signal;
    },
    invalidate() {
      controller.abort();
      controller = new AbortController();
    },
    acquire(signal?: AbortSignal) {
      return linkRequestSignals(controller.signal, signal);
    },
  };
}
