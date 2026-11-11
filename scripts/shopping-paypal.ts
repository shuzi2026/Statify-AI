import { z } from "zod";
import { DISH_SOAP_NAME, type ShoppingOffer } from "../shared/shopping-demo";

export type SandboxCredentials = { clientId: string; secret: string };
type OrderQuote = Pick<ShoppingOffer, "quoteId" | "merchant" | "cents" | "productTitle">;
const base = "https://api-m.sandbox.paypal.com";
const orderId = z.string().regex(/^[A-Z0-9]{10,32}$/);
const amount = z.object({ currency_code: z.literal("USD"), value: z.string() });
const order = z.object({
  id: orderId,
  status: z.string(),
  links: z.array(z.object({ rel: z.string(), href: z.string() })).optional(),
  purchase_units: z.array(z.object({
    custom_id: z.string().optional(),
    amount: amount.optional(),
    payments: z.object({ captures: z.array(z.object({ status: z.string(), amount })) }).optional(),
  })).optional(),
});

export function paypalSandbox(credentials: SandboxCredentials) {
  let authorization: { token: string; expires: number } | undefined;

  async function accessToken() {
    if (authorization && authorization.expires > Date.now()) return authorization.token;
    const basic = Buffer.from(`${credentials.clientId}:${credentials.secret}`).toString("base64");
    const response = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error("PayPal sandbox authentication failed");
    const { access_token, expires_in } = z.object({ access_token: z.string().min(1), expires_in: z.number() }).parse(await response.json());
    authorization = { token: access_token, expires: Date.now() + Math.max(0, expires_in - 60) * 1000 };
    return access_token;
  }

  async function request(path: string, body?: object, requestId?: string) {
    const response = await fetch(`${base}/v2/checkout/orders${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      if (response.status === 401) authorization = undefined;
      throw new Error("PayPal sandbox order request failed");
    }
    return order.parse(await response.json());
  }

  async function create(quote: OrderQuote, origin: string) {
    const value = (quote.cents / 100).toFixed(2);
    const price = { currency_code: "USD", value };
    const result = await request("", {
      intent: "CAPTURE",
      purchase_units: [{
        custom_id: quote.quoteId,
        description: `Statify demo / ${quote.merchant}`,
        amount: { ...price, breakdown: { item_total: price } },
        items: [{ name: Array.from(quote.productTitle ?? `${DISH_SOAP_NAME}, 18 fl oz`).slice(0, 100).join(""), quantity: "1", unit_amount: price, category: "PHYSICAL_GOODS" }],
      }],
      payment_source: { paypal: { experience_context: {
        brand_name: "Statify Demo",
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
        return_url: `${origin}/?shoppingReturn=${quote.quoteId}`,
        cancel_url: `${origin}/?shoppingCancel=${quote.quoteId}`,
      } } },
    }, quote.quoteId);
    const href = result.links?.find((item) => item.rel === "payer-action" || item.rel === "approve")?.href;
    const approval = href ? new URL(href) : undefined;
    if (!approval || approval.origin !== "https://www.sandbox.paypal.com" || approval.username || approval.password) {
      throw new Error("PayPal sandbox approval link missing");
    }
    return { orderId: result.id, approvalUrl: approval.href };
  }

  async function complete(id: string, quote: OrderQuote) {
    const value = (quote.cents / 100).toFixed(2);
    const current = await request(`/${id}`);
    const unit = current.purchase_units?.[0];
    if (current.id !== id || current.purchase_units?.length !== 1 || unit?.custom_id !== quote.quoteId || unit.amount?.value !== value) {
      throw new Error("PayPal sandbox order details mismatch");
    }
    const result = current.status === "APPROVED"
      ? await request(`/${id}/capture`, {}, `c${quote.quoteId}`)
      : current;
    if (result.id === id && result.status === "COMPLETED" && result.purchase_units?.[0]?.payments?.captures.some(
      (capture) => capture.status === "COMPLETED" && capture.amount.value === value,
    )) return "completed";
    if (result.purchase_units?.[0]?.payments?.captures.some((capture) => capture.status === "PENDING")) return "pending";
    return "unapproved";
  }

  return { create, complete };
}
