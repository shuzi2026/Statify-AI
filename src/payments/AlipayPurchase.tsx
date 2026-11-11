import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
export type AlipayEnvironment = "sandbox" | "live";

export type AlipayOffer = {
  amount: string;
  currency: "CNY";
  subject: string;
  terms_version: string;
  collector_title?: string;
};
type Order = {
  id: string;
  amount: string;
  status: string;
  environment: AlipayEnvironment;
  channel: "web" | "app";
  collector_batch_id?: string | null;
};
export type NativeAlipay = {
  pay(
    orderString: string,
    environment: AlipayEnvironment,
  ): Promise<{ resultStatus: string }>;
  onResume(callback: () => void): Promise<{ remove(): Promise<void> }>;
};
export type AlipayRequest = (
  path: string,
  body?: Record<string, unknown>,
) => Promise<unknown>;
const labels: Record<string, string> = {
  pending: "等待付款或确认",
  paid: "已付款",
  closed: "已关闭",
  review: "退款处理中或待核对",
  refunded: "已退款",
};

export function submitAlipayForm(
  html: string,
  environment: AlipayEnvironment = "sandbox",
) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const source = parsed.querySelector("form");
  if (
    !source ||
    parsed.querySelectorAll("form").length !== 1 ||
    source.method.toLowerCase() !== "post"
  )
    throw Error("支付入口无效，请刷新订单");
  const url = new URL(source.action);
  if (
    !["sandbox", "live"].includes(environment) ||
    url.origin !==
      (environment === "live"
        ? "https://openapi.alipay.com"
        : "https://openapi-sandbox.dl.alipaydev.com") ||
    url.pathname !== "/gateway.do" ||
    url.username ||
    url.password
  )
    throw Error("支付地址不匹配");
  // Rebuild hidden fields only; never execute HTML/scripts supplied in an API response.
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url.href;
  form.hidden = true;
  for (const field of source.querySelectorAll("input[type=hidden]")) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = (field as HTMLInputElement).name;
    input.value = (field as HTMLInputElement).value;
    form.append(input);
  }
  document.body.append(form);
  try {
    HTMLFormElement.prototype.submit.call(form);
  } finally {
    form.remove();
  }
}

export function AlipayPurchase({
  accountId,
  offer,
  member,
  request,
  refresh,
  nativePayment,
  environment = "sandbox",
  showHeading = true,
}: {
  accountId: string;
  offer: AlipayOffer;
  member: boolean;
  request: AlipayRequest;
  refresh: () => Promise<unknown>;
  nativePayment?: NativeAlipay;
  environment?: AlipayEnvironment;
  showHeading?: boolean;
}) {
  const [orders, setOrders] = useState<Order[]>([]),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [message, setMessage] = useState("");
  const generation = useRef(0),
    locked = useRef(false),
    requestId = useRef("");
  const currentRequest = useRef(request);
  currentRequest.current = request;
  useEffect(() => {
    const epoch = ++generation.current;
    setOrders([]);
    setConsent(false);
    setMessage("");
    setBusy(false);
    locked.current = false;
    requestId.current = "";
    currentRequest
      .current(
        "/alipay/orders?expected_account_id=" + encodeURIComponent(accountId),
      )
      .then((data) => {
        if (generation.current === epoch)
          setOrders((data as { items: Order[] }).items);
      })
      .catch(() => {
        if (generation.current === epoch)
          setMessage("订单暂未读取，请刷新订单。");
      });
    return () => {
      generation.current++;
    };
  }, [accountId, environment, offer.terms_version]);
  async function action(work: () => Promise<unknown>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage("");
    const epoch = generation.current;
    try {
      await work();
    } catch (e) {
      if (epoch === generation.current)
        setMessage(e instanceof Error ? e.message : "订单暂不可用");
    } finally {
      if (epoch === generation.current) {
        locked.current = false;
        setBusy(false);
      }
    }
  }
  async function reload() {
    const epoch = generation.current;
    const data = (await request(
      "/alipay/orders?expected_account_id=" + encodeURIComponent(accountId),
    )) as { items: Order[] };
    if (epoch !== generation.current) throw Error("账号已改变，请重新查询");
    setOrders(data.items);
    await refresh();
    if (epoch !== generation.current) throw Error("账号已改变，请重新查询");
    return data.items;
  }
  async function pay(id: string) {
    const epoch = generation.current;
    if (nativePayment) {
      const result = (await request(`/alipay/orders/${id}/app`, {
        expected_account_id: accountId,
      })) as { order_string: string; environment: string };
      if (epoch !== generation.current) throw Error("账号已改变，请重新购买");
      if (result.environment !== environment) throw Error("支付环境不匹配");
      let status = "6004";
      try {
        status = (await nativePayment.pay(result.order_string, environment))
          .resultStatus;
      } catch {
        // Unknown outcome: keep the same order and query the server.
      }
      if (epoch !== generation.current) throw Error("账号已改变，请重新查询");
      await request(`/alipay/orders/${id}/check`, {
        expected_account_id: accountId,
      });
      await reload();
      if (epoch === generation.current)
        setMessage(
          status === "6001"
            ? "已返回，请以订单状态为准。"
            : "已核对订单；仍待确认时请稍后刷新，勿重复付款。",
        );
      return;
    }
    const result = (await request(`/alipay/orders/${id}/page`, {
      expected_account_id: accountId,
    })) as { payment_html: string };
    if (epoch !== generation.current) throw Error("账号已改变，请重新购买");
    submitAlipayForm(result.payment_html, environment);
  }
  useEffect(() => {
    if (!nativePayment) return;
    let disposed = false;
    let listener: { remove(): Promise<void> } | undefined;
    void nativePayment
      .onResume(() => {
        if (!disposed) void action(reload);
      })
      .then((handle) => {
        if (disposed) void handle.remove();
        else listener = handle;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      void listener?.remove();
    };
  }, [accountId, nativePayment]);
  return (
    <section
      className="membership-block alipay-purchase"
      aria-label="支付宝购买"
      aria-busy={busy}
    >
      {showHeading && <h3>{member ? "购买记录" : "支付宝购买"}</h3>}
      {!member && (
        <div className="purchase-offer">
          <div className="purchase-offer-price">
            <strong>¥{offer.amount}</strong>
            <span>永久会员</span>
          </div>
          <p>
            {environment === "sandbox"
              ? "沙箱测试 · 不使用真实资金"
              : "一次购买，永久使用"}
          </p>
          {environment === "live" && offer.collector_title && (
            <p className="purchase-founder">
              <span className="membership-founder-badge">原始股东</span>
              <small>本次首发购买赠送</small>
            </p>
          )}
        </div>
      )}
      {!member && (
        <>
          <label className="purchase-consent">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              {environment === "sandbox"
                ? "我了解这是沙箱测试，测试会员不代表正式购买。"
                : "确认购买，并绑定当前登录账号。"}
            </span>
          </label>
          <button
            className="primary purchase-submit"
            disabled={busy || !consent}
            onClick={() =>
              void action(async () => {
                const epoch = generation.current;
                // Reopening this page loses its request key, not the order.
                // Resume the server's pending order before attempting a new one.
                const currentOrders = await reload();
                const existing = currentOrders.find(
                  (order) =>
                    order.environment === environment &&
                    ["pending", "review"].includes(order.status),
                );
                if (existing) {
                  if (existing.status === "review")
                    throw Error("这笔订单正在核对，请刷新订单或联系开发者。");
                  if (
                    existing.channel &&
                    existing.channel !== (nativePayment ? "app" : "web")
                  )
                    throw Error("请在原付款入口继续支付，或先关闭未付款订单。");
                  await pay(existing.id);
                  return;
                }
                requestId.current ||= crypto.randomUUID();
                const order = (await request("/alipay/orders", {
                  request_id: requestId.current,
                  channel: nativePayment ? "app" : "web",
                  terms_version: offer.terms_version,
                  expected_account_id: accountId,
                })) as Order;
                if (epoch !== generation.current) throw Error("账号已改变");
                if (order.environment !== environment)
                  throw Error("支付环境不匹配");
                await reload();
                if (order.status === "pending") await pay(order.id);
                else {
                  requestId.current = "";
                  setMessage(
                    order.status === "closed"
                      ? "原订单已关闭，请重新点击付款。"
                      : "已核对订单，请查看当前会员状态。",
                  );
                }
              })
            }
          >
            {environment === "sandbox"
              ? "创建测试订单并前往支付宝"
              : `支付宝支付 ¥${offer.amount}`}
          </button>
        </>
      )}
      <div className="purchase-orders-heading">
        <h3>订单</h3>
        <button
          className="purchase-refresh"
          disabled={busy}
          onClick={() =>
            void action(async () => {
              for (const order of orders.filter((o) =>
                ["pending", "review"].includes(o.status),
              ))
                await request(`/alipay/orders/${order.id}/check`, {
                  expected_account_id: accountId,
                });
              await reload();
            })
          }
        >
          刷新订单
        </button>
      </div>
      {busy && (
        <div className="purchase-loading" role="status">
          <LoaderCircle aria-hidden="true" size={22} />
          <span>请稍等…</span>
        </div>
      )}
      {!busy && message && <p role="status">{message}</p>}
      {!orders.some((order) => order.environment === environment) && (
        <p className="purchase-empty">暂无订单</p>
      )}
      <ul className="membership-orders">
        {orders
          .filter((order) => order.environment === environment)
          .map((order) => (
            <li key={order.id}>
              <span>
                ¥{order.amount} · {labels[order.status] || "待核对"}
              </span>
              {order.collector_batch_id && (
                <small>
                  首发典藏批次
                  {order.status === "refunded" ? " · 对应资格已撤销" : ""}
                </small>
              )}
              {order.status === "pending" && (
                <>
                  {(!order.channel ||
                    order.channel === (nativePayment ? "app" : "web")) && (
                    <button
                      disabled={busy}
                      onClick={() => void action(() => pay(order.id))}
                    >
                      继续付款
                    </button>
                  )}
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        const result = (await request(
                          `/alipay/orders/${order.id}/close`,
                          {
                            expected_account_id: accountId,
                          },
                        )) as Order;
                        requestId.current = "";
                        await reload();
                        setMessage(
                          result.status === "closed"
                            ? "未付款订单已关闭。"
                            : result.status === "paid"
                              ? "订单已付款，无法关闭，请查看会员状态。"
                              : "这笔订单尚未关闭，可继续付款，或稍后刷新订单。",
                        );
                      })
                    }
                  >
                    关闭未付款订单
                  </button>
                </>
              )}
            </li>
          ))}
      </ul>
      <p className="help">付款后未开通？请先刷新订单，勿重复付款。</p>
      <details className="purchase-refund">
        <summary>退款说明</summary>
        <p>请联系开发者进行退款操作。</p>
        <p>退款仅撤销对应购买权益，本地记录保留。</p>
      </details>
    </section>
  );
}
