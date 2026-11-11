import { useSyncExternalStore } from "react";
import { z } from "zod";
import { acceptEntitlement, type Entitlement } from "./access";
import {
  paymentRequest,
  readOfflineAccount,
  writeOfflineAccount,
  clearCnSession,
} from "./transport";
import {
  verifyCnLicense,
  verifyCnSigned,
  type CnEnvelope,
  type CnLicense,
} from "./cn-license";
import { readFounderPayload, type FounderEdition } from "../../shared/founder";
import { verifyCollector, type CollectorEdition } from "./cn-collector";
import { leavePreviewMembership } from "./preview-access";
import { startAccountLifecycle } from "./lifecycle";
import { sharedService } from "../application/lifecycle";
import { recordRuntimeIssue } from "../runtime-diagnostics";
import {
  PaymentApiError,
  PaymentRequestError,
  assertRequestActive,
  requestScope,
  type RequestOptions,
} from "./request-policy";
const requests = requestScope(),
  configRequests = requestScope();
const sandboxOfferSchema = z.object({
  amount: z
    .string()
    .regex(/^\d{1,8}\.\d{2}$/)
    .refine((value) => Number(value) > 0),
  currency: z.literal("CNY"),
  subject: z.string().min(1).max(256),
  terms_version: z.string().min(1).max(128),
  collector_title: z.literal("永久会员 · 原始股东典藏版账号").optional(),
});
type Account = {
  id: string;
  username: string;
  email: string;
  character_id: string | null;
  character_nickname: string | null;
};
type Snapshot = {
  config: {
    region: "cn";
    environment: "sandbox";
    account_identity?: "email" | "username";
    sales_enabled: false;
    offer: null;
    alipay_sandbox_enabled?: boolean;
    alipay_environment?: "sandbox" | "live";
    alipay_channels?: ("web" | "app")[];
    alipay_offer?: import("./AlipayPurchase").AlipayOffer;
    account_security_enabled: boolean;
  } | null;
  account: Account | null;
  entitlement: Entitlement | null;
  ready: boolean;
  error: string;
  offline: boolean;
  sessionExpired: boolean;
  license: CnLicense | null;
  collector: CollectorEdition | null;
  founder: FounderEdition | null;
};
let snapshot: Snapshot = {
  config: null,
  account: null,
  entitlement: null,
  ready: false,
  error: "",
  offline: false,
  sessionExpired: false,
  license: null,
  collector: null,
  founder: null,
};
let collectorReceipt: CnEnvelope | null = null;
let founderReceipt: CnEnvelope | null = null;
let receipt: CnEnvelope | null = null,
  seen: Record<string, number> = {},
  generation = 0,
  lifecycleEpoch = 0,
  persistence = Promise.resolve();
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
export const subscribeCnAccount = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const publish = (patch: Partial<Snapshot>) => {
  snapshot = { ...snapshot, ...patch };
  acceptEntitlement(snapshot.entitlement);
  listeners.forEach((fn) => fn());
};
export function useCnAccount() {
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
export function getCnAccount() {
  return snapshot;
}
async function persist() {
  const value = JSON.stringify({
    receipt,
    collectorReceipt,
    founderReceipt,
    seen,
  });
  const epoch = generation;
  persistence = persistence
    .catch(() => {})
    .then(async () => {
      if (epoch !== generation) return;
      try {
        await writeOfflineAccount(value);
      } catch (e) {
        try {
          if (epoch === generation) await writeOfflineAccount("");
        } catch {}
        throw e;
      }
    });
  await persistence;
}
async function consume(
  raw: unknown,
  epoch: number,
  signal?: AbortSignal,
  account?: string,
  collectorRaw?: unknown,
  founderRaw?: unknown,
) {
  const { envelope, license } = await verifyCnLicense(raw);
  const collector = collectorRaw
    ? await verifyCollector(collectorRaw, license)
    : null;
  const founder = founderRaw ? await verifyCnSigned(founderRaw) : null;
  let edition: FounderEdition | null = null;
  if (founder) {
    try {
      edition = readFounderPayload(founder.payload, {
        region: "cn",
        environment: "sandbox",
        sub: license.sub,
        revision: license.revision,
        permanent:
          license.status === "active" && license.membership && license.v === 1,
      });
    } catch {
      throw Error("典藏身份与账号授权不一致，请刷新");
    }
  }
  assertRequestActive(signal);
  if (epoch !== generation) return;
  if (account && license.sub !== account)
    throw new PaymentApiError(409, {
      code: "account_changed",
      title: "账号已变化，请重新登录。",
    });
  if ((seen[license.sub] || 0) > license.revision)
    throw Error("已忽略旧版授权，请联网刷新账号状态");
  seen[license.sub] = license.revision;
  receipt = envelope;
  collectorReceipt = collector?.envelope || null;
  founderReceipt = founder?.envelope || null;
  const active = license.status === "active";
  publish({
    account: {
      id: license.sub,
      username: license.email,
      email: license.email,
      character_id: license.character_id,
      character_nickname: license.character_nickname,
    },
    license,
    collector: collector?.edition || null,
    founder: edition,
    entitlement: {
      member: active && license.membership,
      trial_ends_at: active ? license.trial_ends_at : null,
      trial_available: active && license.trial_available,
      initial_adjustment_until: null,
      initial_adjustment: null,
      member_ends_at: license.v === 2 ? license.membership_ends_at : null,
      valid_until: Number.MAX_SAFE_INTEGER,
    },
    ready: true,
    // A signed grant says nothing about the current online cookie.
  });
  if (expiryTimer !== undefined) clearTimeout(expiryTimer);
  if (license.v === 2 && license.membership) {
    const remaining = license.membership_ends_at - Date.now();
    if (remaining > 0) {
      const notify = () => {
        const left = license.membership_ends_at - Date.now();
        if (left > 0) {
          expiryTimer = setTimeout(notify, Math.min(left, 2147483647));
          return;
        }
        if (snapshot.license === license)
          publish({ entitlement: { ...snapshot.entitlement!, member: false } });
      };
      expiryTimer = setTimeout(notify, Math.min(remaining, 2147483647));
    }
  }
  await persist();
}
export async function cnAction(
  path: string,
  body?: unknown,
  options: RequestOptions = {},
) {
  assertRequestActive(options.signal);
  // Only identity changes invalidate in-flight grants. Revoking another session
  // or a failed trial request must not discard a newer signed status response.
  const changesIdentity =
    body !== undefined &&
    [
      "/auth/login",
      "/auth/register",
      "/auth/change-password",
      "/auth/logout",
    ].includes(path);
  if (path === "/codes/redeem" && body && typeof body === "object")
    body = {
      ...body,
      supports_monthly: true,
      ...(snapshot.account ? { expected_account_id: snapshot.account.id } : {}),
    };
  if (changesIdentity) {
    ++generation;
    requests.invalidate();
  }
  const epoch = generation,
    account = snapshot.account?.id,
    scope = requests.acquire(options.signal);
  try {
    const response = await paymentRequest(path, body, {
      ...options,
      signal: scope.signal,
    });
    assertRequestActive(scope.signal);
    if (response.status < 200 || response.status >= 300) {
      let expired =
        response.status === 401 &&
        !["/auth/login", "/auth/register", "/licenses/status"].includes(path);
      // This endpoint also uses 401 for an incorrect current password. Probe the
      // cookie read-only, rather than guessing from localized server error text.
      if (expired && path === "/auth/change-password") {
        expired = false;
        try {
          const me = await paymentRequest("/me", undefined, {
            signal: scope.signal,
          });
          const identity = (me.data as { account?: { id: string } | null })
            ?.account;
          expired =
            me.status === 401 ||
            (me.status === 200 &&
              (identity === null || (!!identity && identity.id !== account)));
        } catch {
          /* The original password error remains actionable while offline. */
        }
        assertRequestActive(scope.signal);
      }
      if (expired)
        publish({
          sessionExpired: true,
          offline: true,
          error: "在线登录已过期，请重新登录；已验证的离线资格仍可使用。",
        });
      throw new PaymentApiError(
        response.status,
        response.data,
        expired,
        "请求未完成，请稍后重试。",
      );
    }
    const result = response.data as {
      license?: unknown;
      collector?: unknown;
      founder?: unknown;
    };
    if (result.license)
      await consume(
        result.license,
        epoch,
        scope.signal,
        changesIdentity ? undefined : account,
        result.collector,
        result.founder,
      );
    assertRequestActive(scope.signal);
    if (["/auth/login", "/auth/register"].includes(path) && result.license)
      publish({ sessionExpired: false, offline: false, error: "" });
    return response.data;
  } finally {
    scope.dispose();
  }
}
export async function refreshCnAccount() {
  const epoch = generation,
    started = lifecycleEpoch;
  try {
    const config = await paymentRequest("/config", undefined, {
        signal: configRequests.signal,
      }),
      c = config.data as {
        region?: string;
        environment?: string;
        backend?: string;
        account_security_enabled?: boolean;
        alipay_sandbox_enabled?: unknown;
        alipay_enabled?: unknown;
        alipay_environment?: unknown;
        alipay_channels?: unknown;
        alipay_offer?: unknown;
      };
    if (config.status !== 200)
      throw new PaymentApiError(
        config.status,
        config.data,
        config.status === 401,
        "暂时无法读取会员状态，请稍后重试。",
      );
    if (
      c?.region !== "cn" ||
      c.environment !== "sandbox" ||
      c.backend !== "cn-postgres-v1"
    )
      throw Object.assign(new PaymentRequestError("configuration"), {
        message: "国区测试服务配置不匹配",
      });
    if (started !== lifecycleEpoch) return;
    const sandboxOffer = sandboxOfferSchema.safeParse(c.alipay_offer);
    const paymentEnvironment =
      c.alipay_enabled === true
        ? ["sandbox", "live"].includes(c.alipay_environment as string)
          ? (c.alipay_environment as "sandbox" | "live")
          : null
        : c.alipay_enabled === undefined && c.alipay_sandbox_enabled === true
          ? "sandbox"
          : null;
    const channels =
      c.alipay_enabled === undefined && paymentEnvironment === "sandbox"
        ? (["web", "app"] as const)
        : z.array(z.enum(["web", "app"])).safeParse(c.alipay_channels).data;
    // Public capabilities survive a login within this lifecycle, not its disposal.
    publish({
      config: {
        region: "cn",
        environment: "sandbox",
        sales_enabled: false,
        offer: null,
        account_security_enabled: c.account_security_enabled === true,
        ...(paymentEnvironment && channels?.length && sandboxOffer.success
          ? {
              alipay_sandbox_enabled: paymentEnvironment === "sandbox",
              alipay_environment: paymentEnvironment,
              alipay_channels: [...channels],
              alipay_offer: sandboxOffer.data,
            }
          : {}),
      },
      ready: true,
    });
    if (epoch !== generation) return;
    if (receipt) {
      await cnAction("/licenses/status", receipt);
      if (epoch !== generation) return;
      const me = (await cnAction("/me")) as { account?: { id: string } | null };
      if (epoch !== generation) return;
      if (
        me.account === null ||
        (me.account && me.account.id !== snapshot.account?.id)
      )
        publish({
          sessionExpired: true,
          offline: true,
          error: "在线登录已过期，请重新登录；已验证的离线资格仍可使用。",
        });
      else if (me.account)
        publish({ sessionExpired: false, offline: false, error: "" });
    } else publish({ offline: false, error: "" });
  } catch (e) {
    if (e instanceof PaymentRequestError && e.kind === "configuration")
      recordRuntimeIssue("api", e, { category: "configuration" });
    if (import.meta.env.DEV)
      console.warn(
        "[cn-account] refresh failed:",
        e instanceof Error ? e.name : "Unknown",
      );
    if (epoch === generation)
      publish({
        ready: true,
        offline: true,
        ...(e instanceof PaymentApiError && e.status === 409
          ? { sessionExpired: true }
          : {}),
        error: snapshot.license
          ? "暂未连接账号服务，继续使用已验证的离线资格。"
          : (e as Error).message || "账号服务暂不可用，离线功能仍可使用。",
      });
  }
}
export async function logoutCnAccount() {
  const epoch = ++generation;
  requests.invalidate();
  const signal = requests.signal;
  if (expiryTimer !== undefined) clearTimeout(expiryTimer);
  receipt = null;
  collectorReceipt = null;
  founderReceipt = null;
  leavePreviewMembership();
  publish({
    account: null,
    license: null,
    collector: null,
    founder: null,
    entitlement: null,
    ready: true,
    error: "",
    offline: false,
    sessionExpired: false,
  });
  try {
    await persist();
  } finally {
    try {
      if (epoch === generation)
        await paymentRequest("/auth/logout", {}, { signal });
    } catch {
    } finally {
      if (epoch === generation) await clearCnSession();
    }
  }
}
export const startCnAccount = sharedService(() => {
  const loadEpoch = generation;
  return startAccountLifecycle({
    initialize: async (active) => {
      try {
        const raw = await readOfflineAccount();
        if (!active() || loadEpoch !== generation) return;
        if (raw) {
          const value = JSON.parse(raw);
          if (value.seen && typeof value.seen === "object")
            seen = Object.fromEntries(
              Object.entries(value.seen).filter(
                ([, v]) =>
                  typeof v === "number" && Number.isSafeInteger(v) && v > 0,
              ),
            ) as Record<string, number>;
          if (value.receipt) {
            publish({ offline: true });
            await consume(
              value.receipt,
              loadEpoch,
              undefined,
              undefined,
              value.collectorReceipt,
              value.founderReceipt,
            );
          }
        }
      } catch {
        if (active() && loadEpoch === generation)
          publish({
            ready: true,
            error: "本地账号许可无法读取，请联网登录；角色存档保留。",
          });
      }
      if (active()) await refreshCnAccount();
    },
    refresh: refreshCnAccount,
    dispose: () => {
      ++generation;
      ++lifecycleEpoch;
      requests.invalidate();
      configRequests.invalidate();
      if (expiryTimer !== undefined) clearTimeout(expiryTimer);
      expiryTimer = undefined;
    },
  });
});
