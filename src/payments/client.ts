import { useSyncExternalStore } from "react";
import { acceptEntitlement, type Entitlement } from "./access";
import {
  paymentRegion,
  paymentEnvironment,
  accountBackend,
  cnAccountBackend,
  globalAppBackend,
} from "./deployment";
import {
  useGlobalAccount,
  globalAction,
  refreshGlobalAccount,
  logoutGlobalAccount,
  startGlobalAccount,
} from "./global-account";
import {
  useCnAccount,
  refreshCnAccount,
  logoutCnAccount,
  startCnAccount,
} from "./cn-account";
import { paymentRequest } from "./transport";
import { startAccountLifecycle } from "./lifecycle";
import { sharedService } from "../application/lifecycle";
import {
  PaymentApiError,
  PaymentRequestError,
  assertRequestActive,
  requestScope,
  type RequestOptions,
} from "./request-policy";
const requests = requestScope();
export type PaymentConfig = {
  region: "cn" | "global";
  environment: "sandbox" | "live";
  account_identity?: "email" | "username";
  account_identity_guard_enabled?: boolean;
  sales_enabled: boolean;
  offer: {
    id: string;
    amount: string;
    currency: string;
    terms_version: string;
    terms_url: string;
  } | null;
};
export type Account = { id: string; username: string };
export type Order = {
  id: string;
  status: string;
  amount: string;
  currency: string;
  environment: string;
  created_at: number;
  approval_url: string | null;
};
type Snapshot = {
  config: PaymentConfig | null;
  account: Account | null;
  entitlement: Entitlement | null;
  ready: boolean;
  error: string;
  sessionExpired: boolean;
};
let snapshot: Snapshot = {
  config: null,
  account: null,
  entitlement: null,
  ready: false,
  error: "",
  sessionExpired: false,
};
const guestSnapshot: Snapshot = { ...snapshot, ready: true };
const listeners = new Set<() => void>();
function publish(next: Snapshot) {
  snapshot = next;
  acceptEntitlement(next.entitlement);
  listeners.forEach((fn) => fn());
}
export function usePayments() {
  if (accountBackend === "none") return guestSnapshot;
  if (cnAccountBackend) return useCnAccount();
  if (globalAppBackend) return useGlobalAccount();
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => snapshot,
  );
}
export async function paymentApi<T>(
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  if (globalAppBackend) return globalAction<T>(path, body, options);
  const scope = requests.acquire(options.signal),
    account = snapshot.account?.id;
  try {
    if (
      body &&
      typeof body === "object" &&
      snapshot.config?.account_identity_guard_enabled &&
      snapshot.account &&
      !["/auth/login", "/auth/register"].includes(path)
    )
      body = { ...body, expected_account_id: snapshot.account.id };
    const { status, data } = await paymentRequest(path, body, {
      ...options,
      signal: scope.signal,
    });
    assertRequestActive(scope.signal);
    if (account !== snapshot.account?.id)
      throw new PaymentRequestError("cancelled");
    if (status < 200 || status >= 300) {
      if (status === 401 && !["/auth/login", "/auth/register"].includes(path))
        publish({
          ...snapshot,
          sessionExpired: true,
          error: "在线登录已过期，请重新登录；已验证的离线资格仍可使用。",
        });
      throw new PaymentApiError(
        status,
        data,
        status === 401 && !["/auth/login", "/auth/register"].includes(path),
      );
    }
    return data as T;
  } finally {
    scope.dispose();
  }
}
let generation = 0,
  lifecycleEpoch = 0;
export async function refreshPayments() {
  if (cnAccountBackend) return refreshCnAccount();
  if (globalAppBackend) return refreshGlobalAccount();
  const requestGeneration = ++generation;
  try {
    const [config, me] = await Promise.all([
      paymentApi<PaymentConfig>("/config"),
      paymentApi<{ account: Account | null; entitlement: Entitlement | null }>(
        "/me",
      ),
    ]);
    if (requestGeneration !== generation) return;
    if (
      config.region !== paymentRegion ||
      config.environment !== paymentEnvironment
    ) {
      publish({
        config: null,
        account: null,
        entitlement: null,
        ready: true,
        error: "会员服务区域或环境与此版本不一致，请联系支持。",
        sessionExpired: false,
      });
      return;
    }
    if (!me.account && snapshot.account)
      publish({
        ...snapshot,
        config,
        ready: true,
        sessionExpired: true,
        error: "在线登录已过期，请重新登录；已验证的离线资格仍可使用。",
      });
    else {
      if (me.account?.id !== snapshot.account?.id) requests.invalidate();
      publish({ config, ...me, ready: true, error: "", sessionExpired: false });
    }
  } catch {
    if (requestGeneration === generation)
      publish({
        ...snapshot,
        ready: true,
        error: "暂时无法连接会员服务。免费功能和本地存档仍可使用。",
      });
  }
}
export async function authenticate(
  mode: "login" | "register",
  username: string,
  password: string,
) {
  if (globalAppBackend) {
    await globalAction("/auth/" + mode, { username, password });
    return;
  }
  const requestGeneration = ++generation;
  requests.invalidate();
  const me = await paymentApi<{ account: Account; entitlement: Entitlement }>(
    "/auth/" + mode,
    { username, password },
  );
  if (requestGeneration !== generation) throw Error("账号操作未完成，请重试");
  publish({ ...snapshot, ...me, error: "", sessionExpired: false });
}
export async function logout() {
  if (cnAccountBackend) return logoutCnAccount();
  if (globalAppBackend) return logoutGlobalAccount();
  const requestGeneration = ++generation;
  requests.invalidate();
  const account = snapshot.account?.id;
  publish({
    ...snapshot,
    account: null,
    entitlement: null,
    sessionExpired: false,
    error: "",
  });
  await paymentApi("/auth/logout", { expected_account_id: account });
  if (requestGeneration !== generation) return;
  publish({ ...snapshot, account: null, entitlement: null });
}
let recovery: Promise<void> | null = null;
export function recoverPaymentOrders() {
  if (recovery) return recovery;
  const started = lifecycleEpoch;
  recovery = (async () => {
    await refreshPayments();
    if (started !== lifecycleEpoch) return;
    const account = snapshot.account?.id;
    if (!account || snapshot.error) return;
    const result = await paymentApi<{
      items: Order[];
      next_cursor: string | null;
    }>("/orders");
    for (const order of result.items.filter(
      (o) => o.status === "created" || o.status === "pending",
    )) {
      if (started !== lifecycleEpoch || snapshot.account?.id !== account)
        return;
      await paymentApi("/orders/" + order.id + "/capture", {});
    }
    if (started === lifecycleEpoch && snapshot.account?.id === account)
      await refreshPayments();
  })().finally(() => {
    recovery = null;
  });
  return recovery;
}
export const startPaymentRefresh = sharedService(() => {
  if (accountBackend === "none") return;
  if (cnAccountBackend) return startCnAccount();
  if (globalAppBackend) return startGlobalAccount();
  return startAccountLifecycle({
    initialize: () => recoverPaymentOrders(),
    refresh: () => recoverPaymentOrders(),
    poll: refreshPayments,
    interval: 5 * 60000,
    dispose: () => {
      ++generation;
      ++lifecycleEpoch;
      requests.invalidate();
    },
  });
});
