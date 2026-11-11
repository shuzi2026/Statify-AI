import { randomUUID } from "node:crypto";
import { inferShoppingKind, type ShoppingOffer } from "../shared/shopping-demo";
import type { retrieveChannel3Product } from "./channel3-search";

type Product = NonNullable<Awaited<ReturnType<typeof retrieveChannel3Product>>>;
export function comparisonKind(product: Product) {
  return inferShoppingKind(product.title) ?? inferShoppingKind(product.category ?? "") ?? product.category;
}

/** One live, cheapest offer per product, prioritizing distinct catalog brands. */
export function comparisonOffers(products: Product[], kind: string, exclude: string[]): ShoppingOffer[] {
  const tokens = kind.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const seen = new Set(exclude);
  const candidates = products.flatMap((product) => {
    const text = `${product.title} ${product.category ?? ""}`.toLowerCase();
    if (inferShoppingKind(kind) && /\b(?:holders?|organizers?|dispensers?|racks?|cases?|covers?|replacement\s+(?:caps?|heads?)|empty\s+bottles?)\b/i.test(product.title)) return [];
    const words = new Set(text.match(/[\p{L}\p{N}]+/gu));
    if (inferShoppingKind(text)?.toLowerCase() !== kind.toLowerCase() &&
      !tokens.every((token) => words.has(token) || words.has(`${token}s`) || words.has(`${token}es`))) return [];
    const offer = product.offers.filter(({ currency, availability, price }) =>
      currency === "USD" && availability === "InStock" && Math.round(price * 100) >= 1 && Math.round(price * 100) <= 10_000)
      .sort((a, b) => a.price - b.price)[0];
    if (!offer) return [];
    const key = product.id ?? offer.url;
    if (seen.has(key)) return [];
    seen.add(key);
    const brand = product.brands[0];
    const title = brand?.name && !product.title.toLowerCase().includes(brand.name.toLowerCase())
      ? `${brand.name} · ${product.title}`.slice(0, 200) : product.title;
    return [{ brand: brand?.id ?? brand?.name ?? key, offer: {
      quoteId: randomUUID(), quoteToken: "", merchant: offer.merchant, cents: Math.round(offer.price * 100),
      url: offer.url, image: product.image, productTitle: title, productId: product.id, kind,
    } }];
  });
  const brands = new Set<string>();
  const distinct = candidates.filter(({ brand }) => {
    if (brands.has(brand)) return false;
    brands.add(brand);
    return true;
  });
  const preferred = new Set(distinct);
  return [...distinct, ...candidates.filter((item) => !preferred.has(item))].map(({ offer }) => offer);
}
