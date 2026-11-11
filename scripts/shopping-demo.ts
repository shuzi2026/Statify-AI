import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  DISH_SOAP_NAME, DISH_SOAP_PRODUCT_ID, SHOPPING_TOKEN_LIMIT, sameShoppingLink,
  shoppingCardProduct, shoppingProductKind, inferShoppingKind, type ShoppingOffer,
} from "../shared/shopping-demo";
import { retrieveChannel3Product, searchChannel3, searchChannel3Page } from "./channel3-search";
import { comparisonKind, comparisonOffers } from "./shopping-comparison";
import { paypalSandbox, type SandboxCredentials } from "./shopping-paypal";
import { demoToken } from "./demo-token";
import { downloadCatalogArtwork } from "./shopping-artwork";

const signedToken = z.string().max(SHOPPING_TOKEN_LIMIT);
const linkedProduct = shoppingCardProduct.pick({ url: true, productId: true, kind: true });
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("quotes"), merchant: z.string().max(255).optional(),
    product: linkedProduct.optional(), compare: z.boolean().optional(), kind: shoppingProductKind.optional(),
    exclude: z.array(z.string().max(2_048)).max(90).optional(), pageToken: z.string().max(8_000).optional() }),
  z.object({ action: z.literal("card_artwork"), product: linkedProduct, name: z.string().trim().min(1).max(200).optional() }),
  z.object({ action: z.literal("create"), quoteToken: signedToken }),
  z.object({ action: z.literal("complete"), orderToken: signedToken }),
]);

const quote = z.object({
  quoteId: z.uuid(), merchant: z.string().min(1).max(255), cents: z.number().int().min(1).max(10_000),
  productTitle: z.string().min(1).max(200).optional(),
  product: shoppingCardProduct.omit({ lastPurchase: true, generatedArt: true }).optional(),
  visitor: z.string(), expires: z.number().int(),
});
const order = quote.extend({ orderId: z.string().regex(/^[A-Z0-9]{10,32}$/) });
type Order = { orderId: string; approvalUrl: string; orderToken: string };

export function createShoppingDemo(apiKey: string, credentials?: SandboxCredentials, key = credentials?.secret ?? randomBytes(32)) {
  const paypal = credentials && paypalSandbox(credentials);
  const quotes = demoToken(key, "shopping-quote", quote, SHOPPING_TOKEN_LIMIT - 44);
  const orders = demoToken(key, "shopping-order", order, SHOPPING_TOKEN_LIMIT - 44);
  // Only share in-flight requests. The browser and PayPal retain the order across restarts.
  const creating = new Map<string, Promise<Order>>();
  const completing = new Map<string, Promise<"completed" | "pending" | "unapproved">>();
  const error = (status: number, code: string) => ({ status, body: { error: code } });
  function signOffer({ quoteId, merchant, cents, productTitle, kind, productId, url, image }: ShoppingOffer, visitor: string) {
    if (!paypal || cents < 1 || cents > 10_000) return;
    const token = quotes.seal({ quoteId, merchant, cents, productTitle, product: { url, kind, productId, image }, visitor, expires: Date.now() + 5 * 60_000 });
    // Leave room for the PayPal order ID when this quote becomes an order token.
    return token.length <= SHOPPING_TOKEN_LIMIT - 128 ? token : undefined;
  }

  async function shopping(input: unknown, origin: string, visitor = "local") {
    const request = requestSchema.safeParse(input).data;
    if (!request) return error(400, "invalid_shopping_request");

    if (request.action === "card_artwork") {
      try {
        const { productId, url } = request.product;
        let product = await (productId
          ? retrieveChannel3Product(apiKey, productId)
          : searchChannel3(apiKey, { url }, AbortSignal.timeout(6_000)).then((products) => products[0])).catch(() => undefined);
        let resolvedLink = !!product;
        if (productId && product?.id !== productId) product = undefined;
        if (!product?.image && request.name) {
          const products = await searchChannel3(apiKey, { query: request.name }, AbortSignal.timeout(6_000)).catch(() => []);
          const kind = inferShoppingKind(request.name);
          const fallback = products.find((item) => item.image && (!kind || comparisonKind(item) === kind));
          if (fallback) { product = fallback; resolvedLink = false; }
        }
        if (!product)
          return error(404, "card_artwork_unavailable");
        return { status: 200, body: {
          // An illustrative image found by name must not replace the user's chosen product link/identity.
          productId: resolvedLink ? product.id : undefined, sourceUrl: product.artwork, image: product.image,
          imageData: await downloadCatalogArtwork(product.image).catch(() => undefined),
        } };
      } catch {
        return error(502, "card_artwork_unavailable");
      }
    }

    if (request.action === "quotes") {
      try {
        const link = request.product;
        if (request.compare) {
          let kind = request.kind ?? link?.kind;
          if (!kind) {
            const original = link ? (link.productId ? await retrieveChannel3Product(apiKey, link.productId) :
              (await searchChannel3(apiKey, { url: link.url }, AbortSignal.timeout(12_000)))[0]) : undefined;
            kind = original ? shoppingProductKind.safeParse(comparisonKind(original)).data : !link ? "Dish soap" : undefined;
          }
          if (!kind) return error(422, "comparison_kind_required");
          let pageToken = request.pageToken;
          for (let page = 0; page < 3; page++) {
            const result = await searchChannel3Page(apiKey, kind, pageToken);
            const candidates = comparisonOffers(result.products, kind, request.exclude ?? []);
            const offers = candidates.slice(0, 3);
            if (offers.length || !result.nextPageToken || result.nextPageToken === pageToken || page === 2) {
              for (const offer of offers) offer.quoteToken = signOffer(offer, visitor) ?? "";
              return { status: 200, body: { offers, kind, paymentConfigured: !!paypal,
                pageToken: candidates.length > 3 ? pageToken : result.nextPageToken,
                hasMore: candidates.length > 3 || !!result.nextPageToken } };
            }
            pageToken = result.nextPageToken;
          }
        }
        const id = link ? link.productId : DISH_SOAP_PRODUCT_ID;
        const lookup = link && (!id || (!request.compare && new URL(link.url).hostname !== "buy.trychannel3.com"));
        const directLookup = lookup
          ? (await searchChannel3(apiKey, { url: link.url }, AbortSignal.timeout(12_000)))[0]
          : undefined;
        let product = id && !lookup ? await retrieveChannel3Product(apiKey, id) : directLookup;
        if (request.compare && directLookup?.id) {
          const details = await retrieveChannel3Product(apiKey, directLookup.id).catch(() => undefined);
          if (details?.id === directLookup.id) product = details;
        }
        if (!product || (id && product.id !== id)) return error(502, "quotes_unavailable");
        const repeatLink = link && !request.compare ? link.url : undefined;
        const lookupMatch = directLookup && repeatLink && directLookup.offers.length === 1
          && directLookup.offers[0].merchant === new URL(repeatLink).hostname.replace(/^www\./, "")
          && /^https:\/\/buy\.trychannel3\.com\/[^/]+-lookup-/.test(directLookup.offers[0].url)
          ? directLookup.offers[0].url : undefined;
        const seen = new Set<string>();
        const available = product.offers
          .filter(({ currency, availability, price, merchant, url }) =>
            currency === "USD" && availability === "InStock" && price >= 0.01 &&
            (!request.merchant || merchant === request.merchant) &&
            (!repeatLink || sameShoppingLink(repeatLink, url) || url === lookupMatch))
          .sort((a, b) => a.price - b.price)
          .filter(({ merchant }) => {
            if (seen.has(merchant)) return false;
            seen.add(merchant);
            return true;
          })
          .slice(0, request.merchant || repeatLink ? 1 : 3);
        const offers = available.map(({ merchant, price, url }): ShoppingOffer => {
          const offer: ShoppingOffer = {
            quoteId: randomUUID(), merchant, cents: Math.round(price * 100), quoteToken: "",
            url: repeatLink ?? url, image: product.image, productId: product.id,
            productTitle: link ? product.title : undefined,
            kind: link ? link.kind : "Dish soap",
          };
          offer.quoteToken = signOffer(offer, visitor) ?? "";
          return offer;
        });
        return { status: 200, body: { offers, paymentConfigured: !!paypal } };
      } catch {
        return error(502, "quotes_unavailable");
      }
    }

    if (!paypal) return error(503, "paypal_unconfigured");
    try {
      if (request.action === "create") {
        const offer = quotes.open(request.quoteToken);
        if (!offer || offer.visitor !== visitor || offer.expires <= Date.now()) return error(410, "quote_expired");
        let pending = creating.get(offer.quoteId);
        if (!pending) {
          pending = paypal.create(offer, origin).then((result) => ({
            ...result,
            orderToken: orders.seal({ ...offer, orderId: result.orderId, expires: Date.now() + 24 * 60 * 60_000 }),
          })).finally(() => creating.delete(offer.quoteId));
          creating.set(offer.quoteId, pending);
        }
        return { status: 200, body: await pending };
      }
      const checkout = orders.open(request.orderToken);
      if (!checkout || checkout.visitor !== visitor || checkout.expires <= Date.now()) return error(404, "order_unknown");
      const { orderId, merchant, cents } = checkout;
      let pending = completing.get(orderId);
      if (!pending) {
        pending = paypal.complete(orderId, checkout).finally(() => completing.delete(orderId));
        completing.set(orderId, pending);
      }
      const status = await pending;
      if (status !== "completed") return error(409, status === "pending" ? "payment_pending" : "payment_unapproved");
      const purchase = { orderId, merchant, cents };
      return { status: 200, body: { receipt: {
        ...purchase,
        ...(checkout.product && { product: { ...checkout.product, title: checkout.productTitle ?? DISH_SOAP_NAME, lastPurchase: purchase } }),
      } } };
    } catch {
      return error(502, "paypal_unavailable");
    }
  }
  return Object.assign(shopping, { signOffer });
}
