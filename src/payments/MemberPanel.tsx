import { NumberInput } from "../inputs/ValueInputs";
import { useEffect, useRef, useState } from "react";
import { assertRequestActive, isRequestCancelled } from "./request-policy";
import { ShieldCheck, KeyRound, RefreshCw } from "lucide-react";
import { Field } from "../components";
import { type State } from "../model";
import { db } from "../storage";
import { memberActive, accountTrialActive, type Adjustment } from "./access";
import {
  needsDefaultAttributes,
  restoreDefaultAttributes,
} from "../attribute-library";
import {
  usePayments,
  paymentApi,
  refreshPayments,
  authenticate,
  logout,
  type Order,
} from "./client";
import { openPaymentCheckout } from "./transport";
import "./payments.css";
import { cnAccountBackend } from "./deployment";
import { CnMemberPanel } from "./CnMemberPanel";
type Run = (
  fn: (s: State) => unknown,
  onError?: (message: string) => void,
) => Promise<boolean>;
const statuses: Record<string, string> = {
  created: "等待付款",
  pending: "付款处理中",
  completed: "已开通",
  revoked: "已退款或撤销",
  review: "部分退款 · 待核查",
};
export function MemberPanel({ s, run }: { s: State; run: Run }) {
  if (cnAccountBackend) return <CnMemberPanel s={s} run={run} />;
  const p = usePayments(),
    [mode, Mode] = useState<"login" | "register">("login"),
    [username, Username] = useState(""),
    [password, Password] = useState(""),
    [code, Code] = useState(""),
    [busy, Busy] = useState(false),
    [error, ErrorText] = useState(""),
    [message, Message] = useState(""),
    [orders, Orders] = useState<Order[]>([]),
    [cursor, Cursor] = useState<string | null>(null),
    [consent, Consent] = useState(false),
    [adjusting, Adjusting] = useState(false),
    [values, Values] = useState<Record<string, number>>({}),
    [applied, Applied] = useState(false);
  const member = memberActive(),
    trial = accountTrialActive(),
    live = p.config?.environment === "live";
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
    const result = await paymentApi<{
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
    if (p.account && !p.sessionExpired)
      void Promise.resolve()
        .then(() => {
          if (!controller.signal.aborted) return loadOrders();
        })
        .catch((e) => {
          if (!isRequestCancelled(e)) ErrorText(e.message);
        });
    return () => controller.abort();
  }, [p.account?.id, p.entitlement?.member, p.sessionExpired]);
  useEffect(() => {
    const value = p.entitlement?.initial_adjustment;
    if (!value) {
      Applied(false);
      return;
    }
    let cancelled = false;
    db.preferences.get("member-adjustment:" + value.request_id).then((row) => {
      if (!cancelled) Applied(!!row);
    });
    return () => {
      cancelled = true;
    };
  }, [p.entitlement?.initial_adjustment?.request_id, s.createdAt]);
  async function syncOrder(o: Order) {
    await paymentApi("/orders/" + o.id + "/capture", {});
    await refreshPayments();
    await loadOrders();
    Message("已重新核对订单与会员权益。");
  }
  async function buy() {
    const offer = p.config?.offer;
    if (!offer || !consent) return;
    const order = await paymentApi<Order>("/orders", {
      request_id: crypto.randomUUID(),
      terms_version: offer.terms_version,
    });
    await loadOrders();
    if (!order.approval_url) {
      Message("订单已创建，请查询订单状态。");
      return;
    }
    await openPaymentCheckout(order.approval_url, live ? "live" : "sandbox");
    Message(
      "请在 PayPal 完成付款后返回 App，将自动核对会员权益；也可点击订单的“核对付款”。",
    );
  }
  async function applyAdjustment(data: Adjustment) {
    if (data.save_created_at !== s.createdAt)
      throw Error("这次调整属于另一个本地存档，请恢复对应存档后再试");
    const ok = await run((st) => {
      if (st.createdAt !== data.save_created_at) throw Error("存档已切换");
      if (data.values.some((v) => !st.attributes.some((a) => a.id === v.id)))
        throw Error("对应属性不存在，请先恢复原存档");
      for (const v of data.values)
        st.attributes.find((a) => a.id === v.id)!.initial = v.initial;
    }, ErrorText);
    if (ok) {
      await db.preferences.put({
        id: "member-adjustment:" + data.request_id,
        value: true,
      });
      Applied(true);
      Adjusting(false);
      Message("初始等级已调整，成长经验保留。");
    }
  }
  const allowedAdjustment =
    member &&
    !p.entitlement?.initial_adjustment &&
    (p.entitlement?.initial_adjustment_until || 0) > Date.now();
  return (
    <section
      className="settings-section membership"
      aria-label="会员与付费"
      aria-busy={busy}
    >
      <header className="membership-heading">
        <ShieldCheck size={25} aria-hidden="true" />
        <div>
          <h2>会员与付费</h2>
          <p>
            {p.config
              ? `${p.config.region === "cn" ? "国内区" : "海外区"} · ${live ? "正式环境" : "测试环境 · 不产生真实收款"}`
              : p.ready
                ? "会员服务未连接"
                : "正在连接会员服务"}
          </p>
        </div>
      </header>
      <p className="membership-status" role="status">
        {member
          ? live
            ? "永久会员"
            : "测试会员"
          : trial
            ? "7 天试用中"
            : "免费使用"}
      </p>
      <p>
        免费使用四个默认属性。会员可替换、排列全部六个属性槽位；纯排序不消耗替换次数。
      </p>
      <p className="help">
        会员为一次性买断，无自动续费。属性与成长记录始终保留；账号用于恢复会员权益，角色存档仍保存在此设备。
      </p>
      {p.error && <p role="status">{p.error}</p>}
      {p.account && p.sessionExpired && (
        <button
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              await logout();
              Message("已退出会员账号，本地存档保留。");
            })
          }
        >
          退出账号
        </button>
      )}
      {!p.account || p.sessionExpired ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void perform(async () => {
              await authenticate(mode, username, password);
              Password("");
              Message(
                mode === "register"
                  ? "账号已创建。请妥善保管账号名和密码。"
                  : "已登录，权益已更新。",
              );
            });
          }}
        >
          <div className="button-row" role="group" aria-label="账号操作">
            <button
              type="button"
              disabled={busy}
              aria-pressed={mode === "login"}
              onClick={() => Mode("login")}
            >
              登录账号
            </button>
            <button
              type="button"
              disabled={busy}
              aria-pressed={mode === "register"}
              onClick={() => Mode("register")}
            >
              创建账号
            </button>
          </div>
          <div className="membership-fields">
            <Field
              label={
                p.config?.account_identity === "email" ? "邮箱" : "会员账号"
              }
            >
              <input
                autoComplete="username"
                required
                type={p.config?.account_identity === "email" ? "email" : "text"}
                pattern={
                  p.config?.account_identity === "email"
                    ? undefined
                    : "[a-z0-9_]{3,32}"
                }
                minLength={3}
                maxLength={p.config?.account_identity === "email" ? 254 : 32}
                value={username}
                onChange={(e) => Username(e.target.value)}
                disabled={busy}
              />
            </Field>
            <Field label="密码">
              <input
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
                minLength={12}
                maxLength={72}
                value={password}
                onChange={(e) => Password(e.target.value)}
                disabled={busy}
              />
            </Field>
          </div>
          <button className="primary" disabled={busy || !p.config}>
            {busy
              ? "处理中…"
              : mode === "login"
                ? "登录并恢复权益"
                : "创建会员账号"}
          </button>
          <p className="help">
            {p.config?.account_identity === "email"
              ? "账号使用邮箱，尚未验证邮箱归属；"
              : "账号使用 3–32 位小写字母、数字或下划线；"}
            密码至少 12 位，最多 72 字节。此版暂不支持自助找回密码。
          </p>
        </form>
      ) : (
        <>
          <div className="membership-account">
            <span>已登录：{p.account.username}</span>
            <button
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await logout();
                  Message("已退出会员账号，本地存档保留。");
                })
              }
            >
              退出账号
            </button>
          </div>
          {p.config?.region === "cn" && !member && (
            <div className="membership-block">
              <button
                disabled={busy || !p.entitlement?.trial_available}
                onClick={() =>
                  void perform(async () => {
                    await paymentApi("/trial", {});
                    await refreshPayments();
                    Message("已开启 7 天试用，可替换第 5、6 槽位。");
                  })
                }
              >
                {trial
                  ? "试用进行中"
                  : p.entitlement?.trial_available
                    ? "主动开启 7 天试用"
                    : "试用机会已使用"}
              </button>
              {p.entitlement?.trial_ends_at && (
                <p className="help">
                  试用截止：
                  {new Date(p.entitlement.trial_ends_at).toLocaleString()}
                </p>
              )}
            </div>
          )}
          <form
            className="membership-block"
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                await paymentApi("/codes/redeem", { code });
                Code("");
                await refreshPayments();
                Message("激活码已绑定当前账号，权益已更新。");
              });
            }}
          >
            <Field label="激活码">
              <input
                autoComplete="off"
                spellCheck={false}
                maxLength={100}
                required
                value={code}
                onChange={(e) => Code(e.target.value)}
                disabled={busy || member}
              />
            </Field>
            <button disabled={busy || member || !code.trim()}>
              <KeyRound size={17} aria-hidden="true" />
              兑换并绑定此账号
            </button>
            <p className="help">
              一个激活码绑定一个账号。已有会员时不会消耗新的激活码。
            </p>
          </form>
          {p.config?.region === "global" && (
            <div className="membership-block">
              {p.config.offer ? (
                <>
                  <p>
                    永久会员 · {p.config.offer.amount} {p.config.offer.currency}
                    {!live && "（沙箱测试）"}
                  </p>
                  <label className="membership-consent">
                    <input
                      type="checkbox"
                      checked={consent}
                      disabled={busy || member}
                      onChange={(e) => Consent(e.target.checked)}
                    />
                    <span>
                      我已阅读{" "}
                      <a
                        href={p.config.offer.terms_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        购买与退款条款
                      </a>
                    </span>
                  </label>
                  <button
                    className="primary"
                    disabled={busy || member || !consent}
                    onClick={() => void perform(buy)}
                  >
                    {live ? "前往 PayPal 付款" : "前往 PayPal 沙箱测试"}
                  </button>
                </>
              ) : (
                <p>PayPal 购买暂未开放。</p>
              )}
            </div>
          )}
          {allowedAdjustment && !adjusting && (
            <button
              disabled={busy}
              onClick={() => {
                Values(
                  Object.fromEntries(
                    s.attributes
                      .filter((a) => a.slot >= 0)
                      .map((a) => [a.id, a.initial]),
                  ),
                );
                Adjusting(true);
              }}
            >
              使用首次购买的初值调整
            </button>
          )}
          {adjusting && (
            <form
              className="membership-block"
              onSubmit={(e) => {
                e.preventDefault();
                void perform(async () => {
                  const adjustment = await paymentApi<Adjustment>(
                    "/initial-adjustments",
                    {
                      request_id: crypto.randomUUID(),
                      save_created_at: s.createdAt,
                      values: Object.entries(values).map(([id, initial]) => ({
                        id,
                        initial,
                      })),
                    },
                  );
                  await refreshPayments();
                  await applyAdjustment(adjustment);
                });
              }}
            >
              <p>
                首次购买后 24 小时内可用一次；保存后消耗机会，成长经验保留。
              </p>
              {s.attributes
                .filter((a) => a.id in values)
                .map((a) => (
                  <Field key={a.id} label={a.name + "初始等级"}>
                    <NumberInput
                      min={0}
                      max={100}
                      step={1}
                      required
                      disabled={busy}
                      value={values[a.id]}
                      onChange={(e) =>
                        Values({ ...values, [a.id]: Number(e.target.value) })
                      }
                    />
                  </Field>
                ))}
              <div className="button-row">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => Adjusting(false)}
                >
                  取消调整
                </button>
                <button className="primary" disabled={busy}>
                  确认并使用一次机会
                </button>
              </div>
            </form>
          )}
          {p.entitlement?.initial_adjustment && !applied && (
            <button
              disabled={busy || !member}
              onClick={() =>
                void perform(() =>
                  applyAdjustment(p.entitlement!.initial_adjustment!),
                )
              }
            >
              恢复已保存的初值调整
            </button>
          )}
          <div className="membership-block">
            <h3>我的 PayPal 订单</h3>
            {!orders.length ? (
              <p className="help">
                还没有 PayPal 订单。激活码权益直接绑定账号。
              </p>
            ) : (
              <ul className="membership-orders">
                {orders.map((o) => (
                  <li key={o.id}>
                    <strong>
                      {o.amount} {o.currency} · {statuses[o.status] || "待核查"}
                    </strong>
                    <small>
                      {new Date(o.created_at).toLocaleString()} ·{" "}
                      {o.environment === "sandbox" ? "测试订单" : "正式订单"}
                    </small>
                    <code>{o.id}</code>
                    <div className="button-row">
                      {o.approval_url && (
                        <a
                          href={o.approval_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => {
                            e.preventDefault();
                            void perform(() =>
                              openPaymentCheckout(
                                o.approval_url!,
                                o.environment === "live" ? "live" : "sandbox",
                              ),
                            );
                          }}
                        >
                          继续前往 PayPal
                        </a>
                      )}
                      <button
                        disabled={busy}
                        onClick={() => void perform(() => syncOrder(o))}
                      >
                        核对付款
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {cursor && (
              <button
                disabled={busy}
                onClick={() => void perform(() => loadOrders(true))}
              >
                加载更多订单
              </button>
            )}
          </div>
        </>
      )}
      <div className="button-row">
        <button
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              await refreshPayments();
              if (p.account) await loadOrders();
            })
          }
        >
          <RefreshCw size={17} aria-hidden="true" />
          刷新会员状态
        </button>
      </div>
      {!member && needsDefaultAttributes(s) && (
        <button
          disabled={busy}
          onClick={() =>
            void run((st) => restoreDefaultAttributes(st, !trial), ErrorText)
          }
        >
          恢复默认四属性，保留自定义档案
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <p className="help">
        {
          "国内区与海外区账号及权益独立。本版需联网恢复会员；断网时已验证权益最多保留 15 分钟，免费功能与数据导出仍可使用。"
        }
      </p>
    </section>
  );
}
