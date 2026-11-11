import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowUpRight, Check, Droplets, LoaderCircle, RotateCcw, ScanSearch, ShoppingBag, X } from "lucide-react";
import { DEMO_PREVIOUS_PURCHASE, DISH_SOAP_NAME, DISH_SOAP_PRODUCT_ID, SHOPPING_DEMO_PATH, inferShoppingKind, merchantName, shoppingCardProduct, shoppingPrice, type ShoppingComparison, type ShoppingOffer, type ShoppingReceipt } from "../../shared/shopping-demo";
import { ShoppingCardFace } from "../cards/ShoppingCardTile";
import type { Card, Entry } from "../model";
import { PurchaseHistory } from "../cards/PurchaseHistory";
import { saveSnapshot } from "../save-publication";
import type { Actions } from "./types";
import "./shopping-demo.css";

type Checkout = { offer: ShoppingOffer; orderId: string; approvalUrl: string; orderToken: string; cardId?: string };
type Step = "choose" | "searching" | "offers" | "creating" | "review" | "finishing" | "complete";

const shoppingErrors: Record<string, string> = {
  busy: "目前有多笔请求，请稍后重试。",
  session_required: "访客会话已过期，请刷新页面后重试。",
  shopping_unconfigured: "本地预览尚未配置 Channel3。",
  quotes_unavailable: "暂时查不到商家报价，请重试。",
  comparison_kind_required: "暂时无法识别商品种类，请在对话中告诉 AI 你想买什么。",
  paypal_unconfigured: "PayPal 沙箱商家应用尚未连接。",
  paypal_unavailable: "PayPal 暂时无法处理这笔测试订单，请重试。",
  quote_expired: "这份报价已过期，请重新查询。",
  order_unknown: "找不到这笔测试订单，请重新查询报价。",
  payment_pending: "PayPal 正在处理这笔付款，稍后可再检查。",
  payment_unapproved: "PayPal 尚未收到付款确认。",
};

async function shoppingRequest<T>(body: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(SHOPPING_DEMO_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

function readRecord<T>(storage: Storage, key: string): T | undefined {
  try { return JSON.parse(storage.getItem(key) ?? "null") ?? undefined; }
  catch { return undefined; }
}

function errorMessage(error: unknown) {
  return (error instanceof Error && shoppingErrors[error.message]) || "购物卡暂时无法连接，请重试。";
}

export function ShoppingDemo({ open, setOpen, profileCreatedAt, catalog, savedCard: suppliedCard, cards, entries, savePurchase }: {
  open: boolean;
  setOpen: (open: boolean) => void;
  profileCreatedAt: number;
  catalog?: ShoppingComparison;
  savedCard?: Card;
  cards: Card[];
  entries: Entry[];
  savePurchase: Actions["saveShoppingPurchase"];
}) {
  const receiptKey = `statify-ai-global:shopping-demo-receipt:${profileCreatedAt}`;
  const pendingKey = `statify-ai-global:shopping-demo-pending:${profileCreatedAt}`;
  const [receipt, setReceipt] = useState(() => readRecord<ShoppingReceipt>(localStorage, receiptKey));
  const [completed, setCompleted] = useState<ShoppingReceipt>();
  const [savedPurchase, setSavedPurchase] = useState<Awaited<ReturnType<Actions["saveShoppingPurchase"]>>>();
  const [step, setStep] = useState<Step>("choose");
  const [comparing, setComparing] = useState(false);
  const [comparisonKind, setComparisonKind] = useState<string>();
  const [comparisonPage, setComparisonPage] = useState<string>();
  const [comparisonSeen, setComparisonSeen] = useState<string[]>([]);
  const [hasMoreComparisons, setHasMoreComparisons] = useState(true);
  const [offers, setOffers] = useState<ShoppingOffer[]>([]);
  const [paymentConfigured, setPaymentConfigured] = useState(false);
  const [checkout, setCheckout] = useState<Checkout>();
  // Explicit card ownership survives a PayPal return or a refreshed quote.
  // It is separate from the card inferred solely to display a completed receipt.
  const [originCardId, setOriginCardId] = useState<string>();
  const [error, setError] = useState("");
  const [preparingCard, setPreparingCard] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const quoteSearch = useRef<AbortController | undefined>(undefined);
  const returning = useRef(false);
  const [flipped, setFlipped] = useState(false);
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const touchFlippedAt = useRef(0);
  const sourceCardId = originCardId ?? checkout?.cardId ?? (completed && entries.find((entry) => entry.purchase?.orderId === completed.orderId)?.cardId);
  const savedCard = suppliedCard ?? cards.find((card) => card.id === sourceCardId && card.shopping);
  const product = savedCard?.shopping;
  const lastPurchase = entries.filter((entry) => entry.cardId === savedCard?.id && entry.purchase)
    .sort((a, b) => b.endedAt - a.endedAt)[0]?.purchase;
  const previous = lastPurchase ?? (product ? product.lastPurchase : receipt ?? DEMO_PREVIOUS_PURCHASE);
  const generic = !!product || !!catalog;
  useLayoutEffect(() => {
    if (!suppliedCard) return;
    quoteSearch.current?.abort();
    setOriginCardId(suppliedCard.id);
    setComparisonKind(suppliedCard.shopping?.kind ?? inferShoppingKind(suppliedCard.name));
    setHasMoreComparisons(true);
    setFlipped(false);
    setCheckout(undefined);
    setError("");
    setStep("choose");
  }, [suppliedCard]);
  useEffect(() => { if (open) setFlipped(false); }, [open]);
  useLayoutEffect(() => {
    if (!catalog) return;
    setOriginCardId(undefined);
    setComparisonKind(catalog.offers[0]?.kind ?? inferShoppingKind(catalog.query));
    setComparisonPage(undefined);
    setComparisonSeen(catalog.offers.map((offer) => offer.productId ?? offer.url));
    setHasMoreComparisons(true);
    setCompleted(undefined);
    quoteSearch.current?.abort();
    setOffers(catalog.offers);
    setPaymentConfigured(catalog.offers.some(({ quoteToken }) => !!quoteToken));
    setComparing(true);
    setCheckout(undefined);
    setError("");
    setStep("offers");
  }, [catalog]);
  useLayoutEffect(() => {
    if (!open) return;
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, [open]);
  useEffect(() => () => quoteSearch.current?.abort(), []);

  async function finish(order: Checkout) {
    const scope = saveSnapshot()?.scope;
    setStep("finishing");
    setError("");
    setSavedPurchase(undefined);
    let purchase: ShoppingReceipt;
    try {
      if (!order.orderToken) throw new Error("order_unknown");
      const result = await shoppingRequest<{ receipt: ShoppingReceipt }>({
        action: "complete", orderToken: order.orderToken,
      });
      if (result.receipt.orderId !== order.orderId) throw new Error("order_unknown");
      purchase = result.receipt;
    } catch (error) {
      setError(errorMessage(error));
      setStep("review");
      return;
    }
    setCompleted(purchase);
    if (!purchase.product) {
      const fallback = shoppingCardProduct.safeParse({
        url: order.offer.url, image: order.offer.image,
        kind: order.offer.kind ?? (!order.offer.productTitle ? "Dish soap" : undefined),
        productId: order.offer.productId ?? (order.offer.productTitle ? undefined : DISH_SOAP_PRODUCT_ID),
        lastPurchase: { orderId: purchase.orderId, merchant: purchase.merchant, cents: purchase.cents },
      }).data;
      if (fallback) purchase = { ...purchase, product: { ...fallback, title: order.offer.productTitle ?? DISH_SOAP_NAME } };
    }
    if (purchase.product?.productId === DISH_SOAP_PRODUCT_ID || !order.offer.productTitle) {
      setReceipt(purchase);
      try { localStorage.setItem(receiptKey, JSON.stringify(purchase)); } catch { /* Keep the receipt in this view. */ }
    }
    try {
      if (!scope) throw new Error("order_unknown");
      setPreparingCard(true);
      setSavedPurchase(await savePurchase(purchase, scope, order.cardId));
      try { sessionStorage.removeItem(pendingKey); } catch { /* Saving the same receipt is idempotent. */ }
    } catch {
      setError("付款已确认，但购物卡未能保存。");
    } finally {
      setPreparingCard(false);
    }
    setStep("complete");
  }

  useEffect(() => {
    const url = new URL(location.href);
    const success = url.searchParams.get("shoppingReturn");
    const cancel = url.searchParams.get("shoppingCancel");
    if (returning.current) return;
    returning.current = true;
    const order = readRecord<Checkout>(sessionStorage, pendingKey);
    if (!success && !cancel) {
      if (order) {
        setOriginCardId(order.cardId);
        setCheckout(order);
        setStep("review");
        setError("这笔测试订单尚未核对。可以检查付款状态，或继续前往 PayPal。");
        setOpen(true);
      }
      return;
    }
    const token = url.searchParams.get("token");
    for (const name of ["shoppingReturn", "shoppingCancel", "token", "PayerID"]) url.searchParams.delete(name);
    history.replaceState(history.state, "", url);
    setOpen(true);
    if (!order || order.offer.quoteId !== (success ?? cancel) || (success && token !== order.orderId)) {
      setError("找不到返回的测试订单，请重新查询报价。");
      return;
    }
    setCheckout(order);
    setOriginCardId(order.cardId);
    setStep("review");
    if (success) void finish(order);
    else setError("已取消付款。可以返回卡牌，或继续确认这笔订单。");
  }, []);

  async function createOrder(offer: ShoppingOffer) {
    setStep("creating");
    setError("");
    try {
      const result = await shoppingRequest<Omit<Checkout, "offer">>({ action: "create", quoteToken: offer.quoteToken });
      // Displayed receipts may resolve a card from an earlier purchase.
      // Only the explicitly opened card or the pending order owns this checkout.
      setCheckout({ ...result, offer, cardId: suppliedCard?.id ?? originCardId });
      setStep("review");
    } catch (error) {
      setError(errorMessage(error));
      setStep("offers");
    }
  }

  async function search(compare: boolean, refresh = false) {
    quoteSearch.current?.abort();
    setError("");
    setCheckout(undefined);
    if (!refresh) setOffers([]);
    setComparing(compare);
    setStep("searching");
    const request = new AbortController();
    quoteSearch.current = request;
    try {
      const result = await shoppingRequest<{ offers: ShoppingOffer[]; paymentConfigured: boolean;
        kind?: string; pageToken?: string; hasMore?: boolean }>({
        action: "quotes",
        compare,
        ...(compare ? { kind: comparisonKind ?? product?.kind ?? inferShoppingKind(savedCard?.name ?? ""),
          exclude: refresh ? comparisonSeen : [], pageToken: refresh ? comparisonPage : undefined } : {}),
        ...(product ? { product: !compare && lastPurchase ? { url: lastPurchase.url } :
          { url: product.url, productId: product.productId, kind: product.kind } }
          : (!compare && previous ? { merchant: previous.merchant } : {})),
      }, request.signal);
      if (request.signal.aborted) return;
      if (compare) {
        setComparisonKind(result.kind);
        setComparisonPage(result.pageToken);
        setHasMoreComparisons(result.hasMore ?? false);
        setComparisonSeen((seen) => [...(refresh ? seen : []), ...result.offers.map((offer) => offer.productId ?? offer.url)].slice(-90));
        if (refresh && !result.offers.length) {
          setError("暂时没有更多同类商品了，已保留当前候选。");
          setStep("offers");
          return;
        }
      }
      setOffers(result.offers);
      setPaymentConfigured(result.paymentConfigured);
      const offer = result.offers[0];
      if (!compare && offer?.quoteToken && (!previous || offer.cents === previous.cents)) await createOrder(offer);
      else setStep("offers");
    } catch (error) {
      if (request.signal.aborted) return;
      setError(errorMessage(error));
      setStep(refresh || catalog ? "offers" : "choose");
    } finally {
      if (quoteSearch.current === request) quoteSearch.current = undefined;
    }
  }

  const close = () => {
    if (step === "creating" || step === "finishing") return;
    if (step === "searching") quoteSearch.current?.abort();
    if (step === "review" && !catalog && !checkout?.offer.productTitle) return setOpen(false);
    setStep("choose");
    setCheckout(undefined);
    setCompleted(undefined);
    setOriginCardId(undefined);
    setError("");
    setOpen(false);
  };
  const back = () => {
    if (checkout?.offer.productTitle && !catalog && !savedCard) {
      close();
      return;
    }
    setStep(catalog ? "offers" : "choose");
    setError("");
  };
  const goToPayPal = (order: Checkout) => {
    try {
      sessionStorage.setItem(pendingKey, JSON.stringify(order));
      location.assign(order.approvalUrl);
    } catch {
      setError("浏览器无法保存这笔待付款订单，请检查浏览器设置后重试。");
    }
  };

  if (!open) return null;
  const drawn = step === "choose";
  const comparison = comparing && (step === "searching" || step === "offers" || step === "creating");
  const busy = step === "creating" || step === "finishing";
  const title = comparison ? "全网比价" : checkout?.offer.productTitle ?? savedCard?.name ?? "洗洁精购物卡";
  const panel = drawn ? "drawn-card-overlay shopping-drawn" :
    comparison ? "shopping-dialog shopping-comparison" : "shopping-dialog";
  return (
    <dialog ref={dialog} className={`shopping-overlay ${panel}`} aria-labelledby="shopping-title" aria-busy={busy || step === "searching"}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (drawn && event.target === event.currentTarget) close(); }}>
      {drawn ? (
        <>
          <h2 id="shopping-title" className="sr-only">{title}</h2>
          <div className={"drawn-card-paper" + (flipped ? " is-flipped" : "")} data-card-pattern="vertical-stripes"
            role="group" tabIndex={0} aria-label={title + "，可翻转卡牌"}
            onDoubleClick={(event) => {
              if (Date.now() - touchFlippedAt.current > 500 && !(event.target as HTMLElement).closest("a,button,summary,details")) setFlipped((value) => !value);
            }}
            onKeyDown={(event) => {
              if (event.target === event.currentTarget && ["Enter", " "].includes(event.key)) {
                event.preventDefault(); setFlipped((value) => !value);
              }
            }}
            onPointerDown={(event) => {
              touchOrigin.current = event.pointerType === "touch" && !(event.target as HTMLElement).closest("a,button,summary,details")
                ? { x: event.clientX, y: event.clientY } : null;
            }}
            onPointerMove={(event) => {
              if (touchOrigin.current && Math.hypot(event.clientX - touchOrigin.current.x, event.clientY - touchOrigin.current.y) > 10)
                touchOrigin.current = null;
            }}
            onPointerCancel={() => { touchOrigin.current = null; lastTap.current = null; }}
            onPointerUp={(event) => {
              if (!touchOrigin.current) return;
              touchOrigin.current = null;
              const previousTap = lastTap.current;
              if (previousTap && Date.now() - previousTap.at < 350 && Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) < 24) {
                event.preventDefault(); touchFlippedAt.current = Date.now(); lastTap.current = null; setFlipped((value) => !value);
              } else lastTap.current = { at: Date.now(), x: event.clientX, y: event.clientY };
            }}>
            <div className="card-flip-inner">
              <div className="drawn-card-front" inert={flipped} aria-hidden={flipped}><ShoppingCardFace card={savedCard} /></div>
              <div className="drawn-card-back" inert={!flipped} aria-hidden={!flipped}>
                <PurchaseHistory card={savedCard} entries={entries.filter((entry) => entry.cardId === (savedCard?.id ?? checkout?.cardId))} />
              </div>
            </div>
          </div>
          <button className="card-flip-hint" type="button" onClick={() => setFlipped((value) => !value)}>
            {flipped ? "双击卡牌，返回正面" : "双击卡牌，查看历史使用记录"}
          </button>
          <p className="card-flip-hint shopping-last-purchase">
            {previous && <>{product || receipt ? "上次测试购买" : "演示购买记录"} · {merchantName(previous.merchant)} {shoppingPrice(previous.cents)} </>}
            {product && <a className="shopping-product-link" href={product.url} target="_blank" rel="noreferrer">查看商品 <ArrowUpRight size={14} /></a>}
          </p>
          <button type="button" className="drawn-card-close icon-button" onClick={close} aria-label="关闭购物卡">
            <X size={21} />
          </button>
          <div className="drawn-card-actions shopping-drawn-actions">
            <button type="button" className="primary drawn-card-start" onClick={() => void search(false)}>
              <RotateCcw size={16} aria-hidden="true" />{product && !previous ? "查询商品并下单" : "重复上次购买"}
            </button>
            <button type="button" className="primary drawn-card-start" onClick={() => void search(true)}>
              <ScanSearch size={16} aria-hidden="true" />全网比价
            </button>
          </div>
          {error && <p className="shopping-alert shopping-drawn-error" role="alert">{error}</p>}
        </>
      ) : (
        <>
          <header className="shopping-header">
            <div><span className="shopping-kicker">PayPal Sandbox · Statify</span><h2 id="shopping-title">{title}</h2></div>
            <button type="button" className="shopping-icon" onClick={close} disabled={busy} aria-label="关闭购物卡">
              <X size={23} />
            </button>
          </header>
          <div className="shopping-body">
            {error && <p className="shopping-alert" role="alert">{error}</p>}
            {(step === "searching" || busy) && <p className="shopping-progress" role="status"><LoaderCircle size={22} />
              {step === "creating" ? "正在生成 PayPal 测试订单…" : step === "finishing" ? (preparingCard ? "正在保存购物卡并处理商品图片…" : "正在确认 PayPal 付款…") : comparing ? "正在查询 Channel3 商家报价…" : "正在核对上次购买的现价…"}
            </p>}
            {step === "offers" && (
              <>
                <p className="shopping-subtitle">{comparing ? comparisonKind ?? catalog?.query ?? savedCard?.name ?? "Dish soap" : savedCard?.name ?? catalog?.query ?? `${DISH_SOAP_NAME} · 18 fl oz`}</p>
                <p className="shopping-note">{generic ? "Channel3 美国商家报价" : "Channel3 美国商家报价 · 单瓶商品价"}</p>
                {!comparing && previous && offers[0] && offers[0].cents !== previous.cents && (
                  <p className="shopping-alert">价格已变动。 上次 {shoppingPrice(previous.cents)} · 当前 {shoppingPrice(offers[0].cents)}</p>
                )}
                {offers.length === 0 && <p>{comparing ? "暂时没有同类商品的在售报价。" : "原商家暂时没有同规格的在售报价。"}</p>}
                {!offers.length && product && <a className="shopping-product-link" href={product.url} target="_blank" rel="noreferrer">查看商品 <ArrowUpRight size={14} /></a>}
                {!catalog && !paymentConfigured && offers.length > 0 && <p className="shopping-note">{shoppingErrors.paypal_unconfigured}</p>}
                <div className="shopping-offers">
                  {offers.map((offer, index) => (
                    <article className="shopping-offer" key={offer.quoteId} style={{ "--offer-index": index } as CSSProperties}>
                      <a className="shopping-offer-link" href={offer.url} target="_blank" rel="noreferrer">
                        <div className="shopping-image">
                          {offer.productTitle ? <ShoppingBag size={58} aria-hidden="true" /> : <Droplets size={58} aria-hidden="true" />}
                          {offer.image && <img src={offer.image} alt="" referrerPolicy="no-referrer"
                            onError={(event) => { event.currentTarget.hidden = true; }} />}
                        </div>
                        <h3 className="shopping-offer-title"><span className="shopping-product-link">
                          {merchantName(offer.merchant)} <ArrowUpRight size={16} aria-hidden="true" />
                        </span></h3>
                      </a>
                      <div className="shopping-offer-copy">
                        <p>{offer.productTitle ?? "原味 · 18 fl oz · 单瓶"}</p>
                        <strong>{shoppingPrice(offer.cents)}</strong>
                        {!offer.quoteToken ?
                          <a className="shopping-primary shopping-merchant-action" href={offer.url} target="_blank" rel="noreferrer">查看商品</a> :
                          <button className="shopping-primary" type="button" disabled={!paymentConfigured}
                            onClick={() => void createOrder(offer)}>生成订单</button>}
                      </div>
                    </article>
                  ))}
                </div>
                <div className="shopping-actions">
                  <button type="button" onClick={catalog ? close : back}><ArrowLeft size={17} />{catalog ? "返回对话" : "返回购物卡"}</button>
                  {comparing && <button type="button" onClick={() => void search(true, true)} disabled={!hasMoreComparisons}>
                    <RotateCcw size={17} />{hasMoreComparisons ? "换一批" : "暂无更多商品"}
                  </button>}
                  {!comparing && offers.length === 0 && <button type="button" className="shopping-primary" onClick={() => void search(true)}>全网比价</button>}
                </div>
              </>
            )}
            {step === "review" && checkout && (
              <>
                <h3>确认测试订单</h3>
                <p>
                  <a className="shopping-product-link" href={checkout.offer.url} target="_blank" rel="noreferrer">
                    {checkout.offer.productTitle ?? DISH_SOAP_NAME} <ArrowUpRight size={16} aria-hidden="true" />
                  </a>{!checkout.offer.productTitle && <> · {"原味 · 18 fl oz · 单瓶"}</>}
                </p>
                <div className="shopping-previous"><span>{merchantName(checkout.offer.merchant)}</span><strong>{shoppingPrice(checkout.offer.cents)}</strong></div>
                <p className="shopping-note">PayPal 沙箱使用测试资金，演示订单不会发货。</p>
                <div className="shopping-actions">
                  <button type="button" onClick={back}><ArrowLeft size={17} />{catalog ? "返回比价" : checkout.offer.productTitle && !savedCard ? "返回对话" : "返回购物卡"}</button>
                  <button type="button" className="shopping-primary" onClick={() => goToPayPal(checkout)}>前往 PayPal 确认</button>
                </div>
                {error && <button type="button" className="shopping-text-button" onClick={() => void finish(checkout)}>检查付款状态</button>}
              </>
            )}
            {step === "complete" && completed && (
              <div role="status" className="shopping-receipt">
                <Check size={30} /><h3>测试付款完成</h3>
                <p>{merchantName(completed.merchant)} · {shoppingPrice(completed.cents)}</p>
                <p className="shopping-note">PayPal 订单号 {completed.orderId}</p>
                {savedPurchase === "created" && <p>已自动创建购物卡，方便下次复购。</p>}
                {error && checkout && <button type="button" className="shopping-text-button" onClick={() => void finish(checkout)}>重试保存购物卡</button>}
                <button type="button" className="shopping-primary" onClick={close}>完成</button>
              </div>
            )}
          </div>
        </>
      )}
    </dialog>
  );
}
