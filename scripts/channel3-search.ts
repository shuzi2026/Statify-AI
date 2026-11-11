import { z } from "zod";
import { shoppingProductId, shoppingProductUrl } from "../shared/shopping-demo";

const offer = z.object({
  domain: z.string().min(1).max(255),
  price: z.object({ price: z.number().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/) }),
  availability: z.string().max(40).nullish(),
  url: shoppingProductUrl,
});

const product = z.object({
  id: z.unknown().optional(),
  title: z.string().min(1),
  description: z.string().nullish(),
  category: z.object({ title: z.string() }).nullish(),
  images: z.array(z.unknown()).nullish(),
  brands: z.array(z.object({ id: z.string(), name: z.string() })).nullish(),
  offers: z.array(z.unknown()),
});
const image = z.object({
  url: shoppingProductUrl,
  is_main_image: z.boolean().optional(),
});

const searchResponse = z.object({ products: z.array(z.unknown()) });
const pagedSearchResponse = searchResponse.extend({ next_page_token: z.string().max(8_000).nullish() });
const lookupResponse = z.object({ product: z.unknown() });

export async function retrieveChannel3Product(apiKey: string, id: string) {
  const response = await fetch(`https://api.trychannel3.com/v1/products/${encodeURIComponent(id)}`, {
    headers: { "x-api-key": apiKey },
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("Channel3 product lookup failed");
  return normalizeProduct(await response.json());
}

export async function searchChannel3(apiKey: string, request: { query: string } | { url: string }, signal: AbortSignal) {
  const lookup = "url" in request;
  const response = await fetch(`https://api.trychannel3.com/v1/${lookup ? "lookup" : "search"}`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(lookup ? request : { ...request, limit: 8 }),
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
  });
  if (!response.ok) throw new Error("Channel3 search failed");

  const body: unknown = await response.json();
  const products = lookup ? [lookupResponse.parse(body).product] : searchResponse.parse(body).products;
  return products.slice(0, 8).map(normalizeProduct).filter((item) => item !== undefined);
}

export async function searchChannel3Page(apiKey: string, query: string, pageToken?: string) {
  const response = await fetch("https://api.trychannel3.com/v1/search", {
    method: "POST", headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit: 30, ...(pageToken && { page_token: pageToken }),
      config: { country: "US", currency: "USD" } }),
    redirect: "error", signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw Error("Channel3 search failed");
  const body = pagedSearchResponse.parse(await response.json());
  return { products: body.products.slice(0, 30).map(normalizeProduct).filter((item) => item !== undefined),
    nextPageToken: body.next_page_token ?? undefined };
}

function normalizeProduct(item: unknown) {
  const candidate = product.safeParse(item).data;
  if (!candidate) return;
  const offers = candidate.offers.flatMap((item) => {
    const quote = offer.safeParse(item).data;
    return quote ? [{
      merchant: quote.domain,
      price: quote.price.price,
      currency: quote.price.currency,
      availability: quote.availability,
      url: quote.url,
    }] : [];
  });
  const images = candidate.images?.flatMap((item) => {
    const parsed = image.safeParse(item).data;
    return parsed ? [parsed] : [];
  });
  const catalogImages = images?.filter(({ url }) => new URL(url).hostname === "cdn.trychannel3.com");
  return {
    id: shoppingProductId.safeParse(candidate.id).data,
    title: candidate.title.slice(0, 200),
    description: candidate.description?.slice(0, 350),
    category: candidate.category?.title.slice(0, 100),
    brands: candidate.brands ?? [],
    image: (catalogImages?.find((item) => item.is_main_image) ?? catalogImages?.[0])?.url,
    artwork: (images?.find((item) => item.is_main_image) ?? images?.[0])?.url,
    offers,
  };
}
