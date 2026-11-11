import { afterEach, expect, test, vi } from "vitest";
import { createShoppingDemo } from "../../scripts/shopping-demo";

afterEach(() => vi.unstubAllGlobals());

const origin = "http://127.0.0.1:15286";
const orderId = "ABCD1234567890";
const productOffer = (domain: string, price: number, availability = "InStock") => ({
  domain, price: { price, currency: "USD" }, availability, url: `https://${domain}/dish-soap`,
});

test("uses only the matching product and only captures the selected quote after PayPal approval", async () => {
  let status = "PAYER_ACTION_REQUIRED";
  let quoteId = "";
  const price = { currency_code: "USD", value: "3.49" };
  const upstream = vi.fn(async (url: string, init: RequestInit) => {
    if (url === "https://api.trychannel3.com/v1/products/X2VpDr8") return Response.json(
      { id: "X2VpDr8", title: "Dawn Ultra 18 fl oz", images: [{ url: "https://cdn.trychannel3.com/example", is_main_image: true }], offers: [
        productOffer("cvs.com", 4.49), productOffer("walgreens.com", 4.19), productOffer("farmandfleet.com", 3.49),
        productOffer("farmandfleet.com", 3.59), productOffer("sold-out.example", 1.59, "OutOfStock"),
      ] },
    );
    expect(url).toMatch(/^https:\/\/api-m\.sandbox\.paypal\.com\//);
    if (url.endsWith("/v1/oauth2/token")) return Response.json({ access_token: "test-token", expires_in: 600 });
    if (url.endsWith("/v2/checkout/orders")) {
      const order = JSON.parse(String(init.body));
      quoteId = order.purchase_units[0].custom_id;
      expect(order).toMatchObject({
        intent: "CAPTURE",
        purchase_units: [{ amount: price, items: [{ quantity: "1", unit_amount: price }] }],
        payment_source: { paypal: { experience_context: { return_url: `${origin}/?shoppingReturn=${quoteId}` } } },
      });
      return Response.json({ id: orderId, status, links: [{ rel: "payer-action", href: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}` }] });
    }
    if (url.endsWith("/capture")) {
      expect(status).toBe("APPROVED");
      status = "COMPLETED";
    }
    return Response.json({ id: orderId, status, purchase_units: [{ custom_id: quoteId, amount: price,
      ...(status === "COMPLETED" ? { payments: { captures: [{ status, amount: price }] } } : {}),
    }] });
  });
  vi.stubGlobal("fetch", upstream);
  const startServer = () => createShoppingDemo("test-channel3", { clientId: "test-client", secret: "test-secret" }, "stable-signing-key");
  const handle = startServer();

  const lastMerchant = await handle({ action: "quotes", merchant: "walgreens.com" }, origin);
  expect(lastMerchant.body).toEqual({ offers: [expect.objectContaining({ merchant: "walgreens.com", cents: 419 })], paymentConfigured: true });
  const comparison = await handle({ action: "quotes" }, origin);
  const offers = "offers" in comparison.body && comparison.body.offers;
  if (!offers) throw new Error("Expected live quote snapshots");
  expect(offers.map((offer) => [offer.merchant, offer.cents])).toEqual([
    ["farmandfleet.com", 349], ["walgreens.com", 419], ["cvs.com", 449],
  ]);
  expect(offers[0].image).toBe("https://cdn.trychannel3.com/example");
  const create = { action: "create", quoteToken: offers[0].quoteToken, cents: 1 };
  expect(await handle(create, origin, "another-visitor")).toMatchObject({ status: 410 });
  const [draft, duplicate] = await Promise.all([handle(create, origin), handle(create, origin)]);
  expect(draft).toEqual(duplicate);
  expect(draft.body).toMatchObject({ orderId });
  if (!("orderToken" in draft.body) || !draft.body.orderToken) throw new Error("Expected an order token");
  const complete = { action: "complete", orderToken: draft.body.orderToken };
  const restarted = startServer();
  expect(await restarted(complete, origin, "another-visitor")).toMatchObject({ status: 404 });
  const [payload, signature] = complete.orderToken.split(".");
  const altered = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  altered.cents = 1;
  const forged = `${Buffer.from(JSON.stringify(altered)).toString("base64url")}.${signature}`;
  expect(await restarted({ ...complete, orderToken: forged }, origin)).toMatchObject({ status: 404 });
  expect(await restarted(complete, origin)).toMatchObject({ status: 409, body: { error: "payment_unapproved" } });
  status = "APPROVED";
  const paid = {
    status: 200, body: { receipt: { orderId, merchant: "farmandfleet.com", cents: 349,
      product: { title: "Dawn Ultra Original Dish Soap", kind: "Dish soap", productId: "X2VpDr8",
        url: "https://farmandfleet.com/dish-soap", image: "https://cdn.trychannel3.com/example",
        lastPurchase: { orderId, merchant: "farmandfleet.com", cents: 349 } },
    } },
  };
  expect(await Promise.all([restarted(complete, origin), restarted(complete, origin)])).toEqual([paid, paid]);
  expect(await startServer()(complete, origin)).toEqual(paid);
  expect(upstream.mock.calls.filter(([url]) => url.endsWith("/v2/checkout/orders"))).toHaveLength(1);
  expect(upstream.mock.calls.filter(([url]) => url.endsWith("/capture"))).toHaveLength(1);
});

test("repeat purchase refreshes only the saved listing and retains its original link", async () => {
  const saved = "https://buy.trychannel3.com/cup-ne38-fPvPex?o=selected&aid=old";
  const upstream = vi.fn(async () => Response.json({
    id: "cup", title: "Steel cup", offers: [
      { ...productOffer("same-shop.example", 10), url: "https://buy.trychannel3.com/cup-ne38-fPvPex?o=different" },
      { ...productOffer("same-shop.example", 12), url: "https://buy.trychannel3.com/cup-ne38-fPvPex?o=selected&aid=new" },
    ],
  }));
  vi.stubGlobal("fetch", upstream);
  const handle = createShoppingDemo("catalog", { clientId: "client", secret: "secret" });
  const product = { url: saved, productId: "cup" };
  const quote = await handle({ action: "quotes", product, compare: false }, origin);
  expect(quote.body).toEqual({ offers: [
    expect.objectContaining({ url: saved, productId: "cup", cents: 1200, quoteToken: expect.any(String) }),
  ], paymentConfigured: true });
  expect((await handle({ action: "quotes", product: { ...product, url: saved.replace("selected", "unavailable") }, compare: false }, origin)).body)
    .toEqual({ offers: [], paymentConfigured: true });
});

test("a catalog order uses the selected item's signed title and price", async () => {
  const handle = createShoppingDemo("catalog", { clientId: "client", secret: "secret" }, "stable-signing-key");
  const quoteToken = handle.signOffer({
    quoteId: "6b839525-a9e1-42c6-808a-11636310bd9c",
    quoteToken: "",
    merchant: "example.com",
    productTitle: "Stainless Steel Tumbler",
    cents: 2250,
    url: "https://example.com/tumbler",
  }, "visitor-a");
  const upstream = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/v1/oauth2/token")) return Response.json({ access_token: "test-token", expires_in: 600 });
    expect(url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
    expect(JSON.parse(String(init.body)).purchase_units[0]).toMatchObject({
      amount: { currency_code: "USD", value: "22.50" },
      items: [{ name: "Stainless Steel Tumbler", quantity: "1" }],
    });
    return Response.json({
      id: orderId, status: "PAYER_ACTION_REQUIRED",
      links: [{ rel: "payer-action", href: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}` }],
    });
  });
  vi.stubGlobal("fetch", upstream);
  const input = { action: "create", quoteToken, productTitle: "Tampered", cents: 1 };
  expect(await handle(input, origin, "visitor-b")).toMatchObject({ status: 410 });
  expect(await handle(input, origin, "visitor-a")).toMatchObject({ status: 200, body: { orderId } });
  expect(upstream).toHaveBeenCalledTimes(2);
});
