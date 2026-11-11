import { RefundRequest } from "./RefundRequest";
import { MembershipStatus } from "./MembershipStatus";
import { LaunchPricing } from "./LaunchPricing";
import { useEffect, useRef, useState } from "react";
import { assertRequestActive } from "./request-policy";
import type { GlobalMemberTarget } from "./GlobalMembershipSummary";
import {
  useGlobalAccount,
  globalAction,
  refreshGlobalAccount,
  logoutGlobalAccount,
} from "./global-account";
import { openPaymentCheckout } from "./transport";
import { CloudPanel } from "../cloud/CloudPanel";
import type { Order } from "./client";
import { validAccountEmail } from "./email-validation";
import "./payments.css";
export function GlobalMemberPanel({
  target = "account",
  back,
}: {
  target?: GlobalMemberTarget;
  back: () => void;
}) {
  const p = useGlobalAccount(),
    [mode, Mode] = useState<"login" | "register">("login"),
    [email, Email] = useState(""),
    [password, Password] = useState(""),
    [code, Code] = useState(""),
    [busy, Busy] = useState(false),
    [error, ErrorText] = useState(""),
    [message, Message] = useState(""),
    [consent, Consent] = useState(false),
    [orders, Orders] = useState<Order[]>([]),
    [cursor, Cursor] = useState<string | null>(null);
  const member = !!p.entitlement?.member,
    trial = (p.entitlement?.trial_ends_at || 0) > Date.now(),
    offer = p.config?.offer;
  const reads = useRef(new AbortController());
  async function perform(fn: () => Promise<void>) {
    if (busy) return;
    Busy(true);
    ErrorText("");
    Message("");
    try {
      await fn();
    } catch (e) {
      ErrorText((e as Error).message);
    } finally {
      Busy(false);
    }
  }
  async function loadOrders(more = false) {
    const signal = reads.current.signal;
    const result = await globalAction<{
      items: Order[];
      next_cursor: string | null;
    }>(
      "/orders" +
        (more && cursor ? "?before=" + encodeURIComponent(cursor) : ""),
      undefined,
      { signal },
    );
    assertRequestActive(signal);
    Orders((old) => (more ? [...old, ...result.items] : result.items));
    Cursor(result.next_cursor);
  }
  useEffect(() => {
    const controller = new AbortController();
    reads.current = controller;
    Orders([]);
    Cursor(null);
    Consent(false);
    Code("");
    Password("");
    if (p.account && !p.sessionExpired)
      void Promise.resolve()
        .then(() => {
          if (!controller.signal.aborted) return loadOrders();
        })
        .catch(() => {});
    return () => controller.abort();
  }, [p.account?.id, p.sessionExpired]);
  useEffect(() => {
    if (p.account) {
      const id = setTimeout(
        () =>
          document
            .getElementById("global-" + target)
            ?.scrollIntoView({ block: "nearest" }),
        0,
      );
      return () => clearTimeout(id);
    }
  }, [target, p.account?.id]);
  async function checkPayments() {
    await loadOrders();
    const result = await globalAction<{ items: Order[] }>("/orders");
    for (const order of result.items.filter((o) =>
      ["created", "pending"].includes(o.status),
    ))
      await globalAction("/orders/" + order.id + "/capture", {});
    await refreshGlobalAccount();
    await loadOrders();
    Message("Payment and membership checked.");
  }
  return (
    <div className="payment-test-page global-member-page">
      <button className="text-button payment-back" onClick={back}>
        Back to settings
      </button>
      <h1>Account & membership</h1>
      <section className="membership-panel">
        <h2>
          <MembershipStatus
            region="global"
            founder={!!member && !!p.founder}
            label={
              member
                ? "Lifetime member"
                : trial
                  ? "7-day trial active"
                  : "Early bird beta · US$7.40 lifetime"
            }
          />
        </h2>
        <LaunchPricing region="global" />
        <p>
          {p.config?.environment === "sandbox"
            ? "Sandbox environment · no live checkout"
            : "One-time purchase · no recurring subscription"}
        </p>
        {p.account && p.sessionExpired && (
          <button
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                await logoutGlobalAccount();
                Mode("login");
                Email("");
                Password("");
                Code("");
                Message("Signed out. Your device save is kept.");
              })
            }
          >
            Sign out
          </button>
        )}
        {!p.account || p.sessionExpired ? (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                if (!validAccountEmail(email))
                  throw Error("Please enter a valid email address.");
                if (
                  new TextEncoder().encode(password).length < 12 ||
                  new TextEncoder().encode(password).length > 72
                )
                  throw Error("Use 12–72 bytes for your password.");
                await globalAction("/auth/" + mode, {
                  username: email.trim(),
                  password,
                });
                Password("");
                Message(mode === "login" ? "Signed in." : "Account created.");
              });
            }}
          >
            <div className="button-row">
              <button
                type="button"
                aria-pressed={mode === "login"}
                disabled={busy}
                onClick={() => Mode("login")}
              >
                Sign in
              </button>
              <button
                type="button"
                aria-pressed={mode === "register"}
                disabled={busy}
                onClick={() => Mode("register")}
              >
                Create account
              </button>
            </div>
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                disabled={busy}
                value={email}
                aria-invalid={error === "Please enter a valid email address."}
                onInvalid={(e) => {
                  e.preventDefault();
                  ErrorText("Please enter a valid email address.");
                }}
                onChange={(e) => {
                  Email(e.target.value);
                  ErrorText("");
                }}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
                minLength={12}
                maxLength={72}
                disabled={busy}
                value={password}
                onChange={(e) => Password(e.target.value)}
              />
            </label>
            <p className="help">
              Use 12–72 bytes for your password. Email ownership verification
              and self-service password recovery are not available in this beta.
            </p>
            <button className="primary" disabled={busy || !p.config}>
              {busy
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>
            <p className="help">
              Sign in to purchase, redeem a code, start your trial or choose
              cloud sync. Login alone does not start the trial or upload a save.
            </p>
          </form>
        ) : (
          <>
            <div className="membership-account">
              <span>{p.account.username}</span>
              <button
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await logoutGlobalAccount();
                    Mode("login");
                    Email("");
                    Password("");
                    Code("");
                    Message("Signed out. Your device save is kept.");
                  })
                }
              >
                Sign out
              </button>
            </div>
            <section id="global-account" className="membership-block">
              <h3>7-day membership trial</h3>
              <button
                disabled={busy || member || !p.entitlement?.trial_available}
                onClick={() =>
                  void perform(async () => {
                    await globalAction("/trial", {});
                    Message("Your seven-day trial has started.");
                  })
                }
              >
                {trial
                  ? "Trial active"
                  : member
                    ? "Lifetime membership active"
                    : p.entitlement?.trial_available
                      ? "Start my 7-day trial"
                      : "Trial already used"}
              </button>
              {p.entitlement?.trial_ends_at && (
                <p>
                  Trial ends:{" "}
                  {new Date(p.entitlement.trial_ends_at).toLocaleString("en")}
                </p>
              )}
            </section>
            <section id="global-paypal" className="membership-block">
              <h3>PayPal purchase</h3>
              <p>Early bird beta · US$7.40 lifetime</p>
              <p>
                PayPal: request a refund within 7 days of payment with a reason,
                subject to manual review. Statutory rights remain unaffected.
                Refund requests are available under your orders. Website
                activation-code buyers apply on the website.
              </p>
              {member ? (
                <p>
                  You already have lifetime membership. No additional purchase
                  is needed.
                </p>
              ) : (
                <>
                  <label className="membership-consent">
                    <input
                      type="checkbox"
                      disabled={busy || !p.config?.sales_enabled}
                      checked={consent}
                      onChange={(e) => Consent(e.target.checked)}
                    />
                    <span>
                      I agree to the{" "}
                      {offer?.terms_url ? (
                        <a
                          href={offer.terms_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          purchase and refund terms
                        </a>
                      ) : (
                        "purchase and refund terms"
                      )}
                      .
                    </span>
                  </label>
                  <button
                    className="primary"
                    disabled={busy || !consent || !p.config?.sales_enabled}
                    onClick={() =>
                      void perform(async () => {
                        if (!offer) return;
                        const order = await globalAction<Order>("/orders", {
                          request_id: crypto.randomUUID(),
                          terms_version: offer.terms_version,
                        });
                        await loadOrders();
                        if (order.approval_url)
                          await openPaymentCheckout(
                            order.approval_url,
                            p.config!.environment,
                          );
                        else
                          Message(
                            "Order created. Select Check payment to refresh.",
                          );
                      })
                    }
                  >
                    {p.config?.environment === "sandbox"
                      ? "Open PayPal sandbox"
                      : "Pay US$7.40 with PayPal"}
                  </button>
                  {!p.config?.sales_enabled && (
                    <p className="help">
                      PayPal checkout has not opened yet. Activation codes and
                      an available trial can still be used.
                    </p>
                  )}
                </>
              )}
            </section>
            <form
              id="global-code"
              className="membership-block"
              onSubmit={(e) => {
                e.preventDefault();
                void perform(async () => {
                  await globalAction("/codes/redeem", { code });
                  Code("");
                  Message(
                    "Code redeemed. Membership is now linked to this account.",
                  );
                });
              }}
            >
              <h3>Activation code</h3>
              <label>
                Code
                <input
                  autoComplete="off"
                  spellCheck={false}
                  required
                  maxLength={100}
                  disabled={busy || member}
                  value={code}
                  onChange={(e) => Code(e.target.value)}
                />
              </label>
              <button disabled={busy || member || !code.trim()}>
                Redeem code
              </button>
              <p className="help">
                A redeemed code is linked to this account. An existing lifetime
                member will not consume another code.
              </p>
            </form>
            <div id="global-cloud">
              <CloudPanel />
            </div>
            <section className="membership-block">
              <h3>PayPal orders</h3>
              {!orders.length ? (
                <p>No PayPal orders yet.</p>
              ) : (
                <ul className="membership-orders">
                  {orders.map((o) => (
                    <li key={o.id}>
                      {p.config?.refund_requests_enabled &&
                        ["completed", "review", "revoked"].includes(o.status) &&
                        ((o as Order & { fulfillment?: string }).fulfillment ===
                        "activation_code" ? (
                          <a
                            href="https://app.mystatify.com/checkout/"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Website activation-code refunds: original buyer
                            applies on the website
                          </a>
                        ) : (
                          <RefundRequest
                            key={`${p.account?.id}:${o.id}`}
                            orderId={o.id}
                            api={(path, body) => globalAction(path, body)}
                          />
                        ))}
                      <strong>
                        {o.amount} {o.currency} ·{" "}
                        {(
                          {
                            created: "Awaiting payment",
                            pending: "Processing",
                            completed: "Membership granted",
                            revoked: "Refunded or revoked",
                            review: "Under review",
                          } as Record<string, string>
                        )[o.status] || o.status}
                      </strong>
                      <small>
                        {new Date(o.created_at).toLocaleString("en")}
                      </small>
                      {o.approval_url && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            void perform(() =>
                              openPaymentCheckout(
                                o.approval_url!,
                                p.config!.environment,
                              ),
                            )
                          }
                        >
                          Continue to PayPal
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {cursor && (
                <button
                  disabled={busy}
                  onClick={() => void perform(() => loadOrders(true))}
                >
                  More orders
                </button>
              )}
              <button
                disabled={busy}
                onClick={() => void perform(checkPayments)}
              >
                Check payment
              </button>
            </section>
            <button
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await refreshGlobalAccount();
                  Message("Membership refreshed.");
                })
              }
            >
              Refresh membership
            </button>
          </>
        )}
        {(error || p.error) && <p role="alert">{error || p.error}</p>}
        {message && <p role="status">{message}</p>}
        <p className="help">
          International and Mainland China accounts are separate. Verified
          lifetime membership remains available offline; cloud sync requires an
          online account check. Local saves remain available after sign-out or
          membership expiry.
        </p>
      </section>
    </div>
  );
}
