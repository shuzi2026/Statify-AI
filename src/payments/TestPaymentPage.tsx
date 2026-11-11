import { useEffect, useRef, useState } from "react";
import { Field } from "../components";
import {
  authenticate,
  logout,
  paymentApi,
  refreshPayments,
  usePayments,
  type Order,
} from "./client";
import { memberActive } from "./access";
import { openPaymentCheckout } from "./transport";
import "./payments.css";

export function TestPaymentPage({ back }: { back: () => void }) {
  const p = usePayments(),
    [mode, Mode] = useState<"register" | "login">("register"),
    [username, Username] = useState(""),
    [password, Password] = useState(""),
    [busy, Busy] = useState(false),
    [error, ErrorText] = useState(""),
    [message, Message] = useState(""),
    [consent, Consent] = useState(false),
    [orders, Orders] = useState<Order[]>([]);
  const guard = useRef(false),
    account = useRef(p.account?.id),
    requestId = useRef(crypto.randomUUID());
  account.current = p.account?.id;
  const member = memberActive(),
    offer = p.config?.offer,
    live = p.config?.environment === "live";
  async function loadOrders() {
    const id = p.account?.id;
    if (!id) return;
    const result = await paymentApi<{ items: Order[] }>("/orders");
    if (account.current === id) Orders(result.items);
  }
  useEffect(() => {
    Orders([]);
    Consent(false);
    requestId.current = crypto.randomUUID();
    if (p.account) void loadOrders().catch((e) => ErrorText(e.message));
  }, [p.account?.id]);
  async function perform(fn: () => Promise<void>) {
    if (guard.current) return;
    guard.current = true;
    Busy(true);
    ErrorText("");
    Message("");
    try {
      await fn();
    } catch (e) {
      ErrorText((e as Error).message);
    } finally {
      guard.current = false;
      Busy(false);
    }
  }
  async function pay() {
    if (!offer || !consent || !p.account || p.error) return;
    const pending = orders.find(
      (o) => o.status === "created" || o.status === "pending",
    );
    const order =
      pending ||
      (await paymentApi<Order>("/orders", {
        request_id: requestId.current,
        terms_version: offer.terms_version,
      }));
    Orders((old) => [order, ...old.filter((o) => o.id !== order.id)]);
    if (order.approval_url)
      await openPaymentCheckout(order.approval_url, live ? "live" : "sandbox");
    else Message("订单已创建，请核对付款状态。");
  }
  async function check() {
    const result = await paymentApi<{ items: Order[] }>("/orders");
    for (const o of result.items.filter(
      (o) => o.status === "created" || o.status === "pending",
    ))
      await paymentApi("/orders/" + o.id + "/capture", {});
    await refreshPayments();
    await loadOrders();
    Message("付款状态已更新。");
  }
  return (
    <div className="payment-test-page" aria-label="登录与会员" aria-busy={busy}>
      <button
        className="text-button payment-back"
        disabled={busy}
        onClick={back}
      >
        返回设置
      </button>
      <h1>登录与会员</h1>
      {!p.account ? (
        <>
          <h2>{mode === "register" ? "请注册" : "登录账号"}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                await authenticate(mode, username, password);
                Password("");
              });
            }}
          >
            <Field
              label={p.config?.account_identity === "email" ? "邮箱" : "账号"}
            >
              <input
                aria-label={
                  p.config?.account_identity === "email" ? "邮箱" : "账号"
                }
                aria-describedby="test-account-hint"
                required
                autoComplete="username"
                minLength={3}
                maxLength={p.config?.account_identity === "email" ? 254 : 32}
                type={p.config?.account_identity === "email" ? "email" : "text"}
                pattern={
                  p.config?.account_identity === "email"
                    ? undefined
                    : "[a-z0-9_]{3,32}"
                }
                value={username}
                disabled={busy}
                onChange={(e) => Username(e.target.value)}
              />
              <small id="test-account-hint">
                {p.config?.account_identity === "email"
                  ? "使用邮箱登录；暂未提供邮箱验证与自助找回"
                  : "3–32位小写字母、数字或下划线"}
              </small>
            </Field>
            <Field label="密码">
              <input
                aria-label="密码"
                aria-describedby="test-password-hint"
                required
                type="password"
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                minLength={12}
                maxLength={72}
                value={password}
                disabled={busy}
                onChange={(e) => Password(e.target.value)}
              />
              <small id="test-password-hint">至少12位，最多72字节</small>
            </Field>
            <button
              className="primary"
              disabled={busy || !p.config || !!p.error}
            >
              {busy ? "处理中…" : mode === "register" ? "注册" : "登录"}
            </button>
          </form>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              Mode(mode === "register" ? "login" : "register");
              Password("");
              ErrorText("");
            }}
          >
            {mode === "register" ? "已有账号，去登录" : "创建新账号"}
          </button>
        </>
      ) : (
        <>
          <p className="test-account">{p.account.username}</p>
          {member ? (
            <p role="status">会员已开通。</p>
          ) : offer &&
            p.config?.region === "global" &&
            p.config.sales_enabled ? (
            <>
              <p className="test-price">
                {offer.amount} {offer.currency}
                {!live && " · 沙箱测试，不产生真实扣款"}
              </p>
              <label className="membership-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={busy}
                  onChange={(e) => Consent(e.target.checked)}
                />
                <span>
                  同意
                  <a href={offer.terms_url} target="_blank" rel="noreferrer">
                    购买与退款条款
                  </a>
                </span>
              </label>
              <button
                className="primary"
                disabled={busy || !consent || !!p.error}
                onClick={() => void perform(pay)}
              >
                {busy ? "处理中…" : live ? "PayPal付款" : "PayPal沙箱付款"}
              </button>
            </>
          ) : (
            <p role="status">PayPal付款暂未开放。</p>
          )}
          <button
            disabled={busy || !!p.error}
            onClick={() => void perform(check)}
          >
            核对付款状态
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                await logout();
                Orders([]);
                Consent(false);
              })
            }
          >
            退出账号
          </button>
        </>
      )}
      {p.error && <p role="status">{p.error}</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <button
        className="text-button"
        disabled={busy}
        onClick={() =>
          void perform(async () => {
            await refreshPayments();
          })
        }
      >
        重新连接
      </button>
    </div>
  );
}
