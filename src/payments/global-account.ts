import { useSyncExternalStore } from "react";
import { z } from "zod";
import { readFounderPayload, type FounderEdition } from "../../shared/founder";
import { acceptEntitlement, type Entitlement } from "./access";
import { paymentEnvironment } from "./deployment";
import { leavePreviewMembership } from "./preview-access";
import {
  clearCnSession,
  paymentRequest,
  readOfflineAccount,
  writeOfflineAccount,
} from "./transport";
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
const requests = requestScope();
const envelopeSchema = z
  .object({
    kid: z.literal("global-v1"),
    payload: z.string().max(8192),
    signature: z.string().max(256),
  })
  .strict();
const licenseSchema = z
  .object({
    v: z.literal(1),
    iss: z.literal("statify-global"),
    region: z.literal("global"),
    environment: z.enum(["sandbox", "live"]),
    sub: z.uuid(),
    email: z.email(),
    member: z.boolean(),
    trial_ends_at: z.number().int().positive().nullable(),
    trial_available: z.boolean(),
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    iat: z.number().int().positive(),
  })
  .strict();
type Envelope = z.infer<typeof envelopeSchema>;
export type GlobalConfig = {
  region: "global";
  environment: "sandbox" | "live";
  global_app_v1: true;
  account_identity: "email";
  account_identity_guard_enabled: true;
  sales_enabled: boolean;
  cloud_enabled: boolean;
  refund_requests_enabled?: boolean;
  offer: {
    id: string;
    amount: string;
    currency: string;
    terms_version: string;
    terms_url: string;
  };
  development_trust?: { kid: string; jwk: JsonWebKey };
};
type Snapshot = {
  account: { id: string; username: string } | null;
  config: GlobalConfig | null;
  entitlement: Entitlement | null;
  founder: FounderEdition | null;
  ready: boolean;
  offline: boolean;
  sessionExpired: boolean;
  error: string;
};
let snapshot: Snapshot = {
  account: null,
  config: null,
  entitlement: null,
  founder: null,
  ready: false,
  offline: false,
  sessionExpired: false,
  error: "",
};
let receipt: Envelope | null = null,
  founderReceipt: Envelope | null = null,
  seen: Record<string, number> = {},
  lastSeen = 0,
  epoch = 0,
  persistence = Promise.resolve(),
  developmentTrust: JsonWebKey | null = null;
const listeners = new Set<() => void>();
export const subscribeGlobalAccount = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const getGlobalAccount = () => snapshot;
export const useGlobalAccount = () =>
  useSyncExternalStore(subscribeGlobalAccount, getGlobalAccount);
function publish(patch: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...patch };
  acceptEntitlement(snapshot.entitlement);
  listeners.forEach((fn) => fn());
}
const decode = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
function trust(): JsonWebKey {
  const raw = import.meta.env.VITE_STATIFY_GLOBAL_TRUST;
  if (raw) return JSON.parse(raw);
  if (
    import.meta.env.DEV &&
    snapshot.config?.development_trust?.kid === "global-v1"
  )
    return snapshot.config.development_trust.jwk;
  if (import.meta.env.DEV && developmentTrust) return developmentTrust;
  throw Error(
    "International license verification is not configured for this build.",
  );
}
async function verifySigned(raw: unknown) {
  const envelope = envelopeSchema.parse(raw),
    key = await crypto.subtle.importKey(
      "jwk",
      trust(),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
  if (
    !(await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      decode(envelope.signature),
      new TextEncoder().encode(envelope.payload),
    ))
  )
    throw Error("Membership signature could not be verified.");
  return {
    envelope,
    payload: JSON.parse(new TextDecoder().decode(decode(envelope.payload))),
  };
}
async function verify(raw: unknown) {
  const { envelope, payload } = await verifySigned(raw);
  const license = licenseSchema.parse(payload);
  if (license.environment !== paymentEnvironment)
    throw Error("Membership belongs to a different environment.");
  return { envelope, license };
}
async function persist() {
  const requestEpoch = epoch;
  const value = JSON.stringify({
    receipt,
    founderReceipt,
    seen,
    lastSeen,
    ...(import.meta.env.DEV ? { developmentTrust } : {}),
  });
  persistence = persistence
    .catch(() => {})
    .then(async () => {
      if (requestEpoch !== epoch) return;
      try {
        await writeOfflineAccount(value);
      } catch (e) {
        try {
          if (requestEpoch === epoch) await writeOfflineAccount("");
        } catch {}
        throw e;
      }
    });
  await persistence;
}
async function consume(
  raw: unknown,
  requestEpoch: number,
  signal?: AbortSignal,
  account?: string,
  founderRaw?: unknown,
) {
  const { envelope, license } = await verify(raw);
  const founder = founderRaw ? await verifySigned(founderRaw) : null;
  const edition = founder
    ? readFounderPayload(founder.payload, {
        region: "global",
        environment: paymentEnvironment,
        sub: license.sub,
        revision: license.revision,
        permanent: license.member,
      })
    : null;
  assertRequestActive(signal);
  if (requestEpoch !== epoch) return;
  if (account && license.sub !== account)
    throw new PaymentApiError(409, {
      code: "account_changed",
      title: "The account changed. Please sign in again.",
    });
  if ((seen[license.sub] || 0) > license.revision)
    throw Error("An outdated membership response was ignored.");
  seen[license.sub] = license.revision;
  lastSeen = Math.max(lastSeen, Date.now(), license.iat);
  receipt = envelope;
  founderReceipt = founder?.envelope || null;
  const trial =
    license.trial_ends_at && license.trial_ends_at > lastSeen
      ? license.trial_ends_at
      : null;
  try {
    await persist();
  } finally {
    if (requestEpoch === epoch && !signal?.aborted)
      publish({
        account: { id: license.sub, username: license.email },
        founder: edition,
        entitlement: {
          member: license.member,
          trial_ends_at: trial,
          trial_available: license.trial_available,
          initial_adjustment_until: null,
          initial_adjustment: null,
          valid_until: Number.MAX_SAFE_INTEGER,
        },
        ready: true,
        // Only login or /me may establish online availability.
      });
  }
}
export { PaymentApiError as GlobalApiError } from "./request-policy";
export async function globalAction<T = unknown>(
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  assertRequestActive(options.signal);
  const route = path.split("?")[0];
  const changesIdentity =
    body !== undefined &&
    ["/auth/login", "/auth/register", "/auth/logout"].includes(path);
  if (changesIdentity) {
    ++epoch;
    requests.invalidate();
  }
  const requestEpoch = epoch,
    account = snapshot.account?.id,
    scope = requests.acquire(options.signal);
  try {
    if (
      body !== undefined &&
      !["/auth/login", "/auth/register", "/licenses/status"].includes(path)
    )
      body = { ...(body as object), expected_account_id: account };
    if (body === undefined && account && path !== "/config")
      path +=
        (path.includes("?") ? "&" : "?") +
        "expected_account_id=" +
        encodeURIComponent(account);
    const response = await paymentRequest(path, body, {
      ...options,
      signal: scope.signal,
    });
    assertRequestActive(scope.signal);
    if (response.status < 200 || response.status >= 300) {
      const expired =
        response.status === 401 &&
        !["/auth/login", "/auth/register", "/licenses/status"].includes(route);
      if (expired)
        publish({
          sessionExpired: true,
          offline: true,
          error:
            "Sign in again to use online services. Verified offline membership is retained.",
        });
      throw new PaymentApiError(
        response.status,
        response.data as { title?: string },
        expired,
      );
    }
    if (
      requestEpoch !== epoch ||
      (!changesIdentity && account !== snapshot.account?.id)
    )
      throw Error("The account changed. Please try again.");
    const data = response.data as { license?: unknown; founder?: unknown };
    if (data.license)
      await consume(
        data.license,
        requestEpoch,
        scope.signal,
        changesIdentity ? undefined : account,
        data.founder,
      );
    assertRequestActive(scope.signal);
    if (["/auth/login", "/auth/register"].includes(route) && data.license)
      publish({ sessionExpired: false, offline: false, error: "" });
    return data as T;
  } finally {
    scope.dispose();
  }
}
let recovery: Promise<void> | null = null;
async function recoverGlobalOrders() {
  if (recovery) return recovery;
  const requestEpoch = epoch,
    id = snapshot.account?.id;
  if (!id) return;
  recovery = (async () => {
    const result = await globalAction<{
      items: { id: string; status: string }[];
    }>("/orders");
    let changed = false;
    for (const order of result.items.filter((o) =>
      ["created", "pending"].includes(o.status),
    )) {
      if (requestEpoch !== epoch || snapshot.account?.id !== id) return;
      await globalAction("/orders/" + order.id + "/capture", {});
      changed = true;
    }
    if (changed && receipt && requestEpoch === epoch)
      await globalAction("/licenses/status", receipt);
  })().finally(() => {
    recovery = null;
  });
  return recovery;
}
export async function refreshGlobalAccount() {
  const requestEpoch = epoch;
  try {
    const response = await paymentRequest(
        "/config?offer_version=2",
        undefined,
        {
          signal: requests.signal,
        },
      ),
      config = response.data as GlobalConfig;
    if (response.status !== 200)
      throw new PaymentApiError(response.status, response.data);
    if (
      config?.region !== "global" ||
      config.environment !== paymentEnvironment ||
      config.global_app_v1 !== true ||
      config.offer?.amount !== "7.40" ||
      config.offer?.currency !== "USD"
    )
      throw Object.assign(new PaymentRequestError("configuration"), {
        message:
          "The international account service is unavailable or mismatched.",
      });
    if (requestEpoch !== epoch) return;
    if (import.meta.env.DEV)
      developmentTrust = config.development_trust?.jwk || null;
    publish({ config, ready: true });
    if (receipt) await globalAction("/licenses/status", receipt);
    if (requestEpoch !== epoch) return;
    const me = await globalAction<{
      license?: unknown;
      account?: { id: string } | null;
    }>("/me");
    if (requestEpoch !== epoch) return;
    if (me.account === null && snapshot.account)
      publish({
        sessionExpired: true,
        offline: true,
        error:
          "Sign in again to use online services. Verified offline membership is retained.",
      });
    else if (me.license || me.account || !snapshot.account)
      publish({
        ready: true,
        offline: false,
        sessionExpired: false,
        error: "",
      });
    if (requestEpoch === epoch && snapshot.account && !snapshot.sessionExpired)
      await recoverGlobalOrders().catch(() => {});
  } catch (e) {
    if (e instanceof PaymentRequestError && e.kind === "configuration")
      recordRuntimeIssue("api", e, { category: "configuration" });
    if (requestEpoch === epoch)
      publish({
        ready: true,
        offline: true,
        ...(e instanceof PaymentApiError && e.status === 409
          ? { sessionExpired: true }
          : {}),
        error:
          (e as Error).message ||
          "Account service unavailable. Your local save is safe.",
      });
  }
}
export async function logoutGlobalAccount() {
  const requestEpoch = ++epoch;
  requests.invalidate();
  const signal = requests.signal;
  const account = snapshot.account?.id;
  receipt = null;
  founderReceipt = null;
  leavePreviewMembership();
  publish({
    account: null,
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
      if (requestEpoch === epoch)
        await paymentRequest(
          "/auth/logout",
          { expected_account_id: account },
          { signal },
        );
    } catch {
    } finally {
      if (requestEpoch === epoch) await clearCnSession();
    }
  }
}
export const startGlobalAccount = sharedService(() => {
  const loadEpoch = epoch;
  return startAccountLifecycle({
    initialize: async (active) => {
      try {
        const raw = await readOfflineAccount();
        if (raw && active() && loadEpoch === epoch) {
          const value = JSON.parse(raw);
          seen = Object.fromEntries(
            Object.entries(value.seen || {}).filter(
              ([, n]) => Number.isSafeInteger(n) && Number(n) > 0,
            ),
          ) as Record<string, number>;
          lastSeen = Number.isSafeInteger(value.lastSeen) ? value.lastSeen : 0;
          if (import.meta.env.DEV)
            developmentTrust = value.developmentTrust || null;
          if (value.receipt) {
            publish({ offline: true });
            await consume(
              value.receipt,
              loadEpoch,
              undefined,
              undefined,
              value.founderReceipt,
            );
          }
        }
      } catch {
        if (active() && loadEpoch === epoch)
          publish({
            ready: true,
            error:
              "Sign in online to restore membership. Your local save is safe.",
          });
      }
      if (active()) await refreshGlobalAccount();
    },
    refresh: refreshGlobalAccount,
    interval: 5 * 60000,
    dispose: () => {
      ++epoch;
      requests.invalidate();
    },
  });
});
