import { z } from "zod";

export const SHOPPING_DEMO_PATH = "/__statify_shopping";
export const DISH_SOAP_CARD = "dawn-ultra-original-18oz";
export const DISH_SOAP_NAME = "Dawn Ultra Original Dish Soap";
export const DISH_SOAP_PRODUCT_ID = "X2VpDr8";
export const SHOPPING_CATEGORY = "Shopping";
export const SHOPPING_TOKEN_LIMIT = 16_384;

export type PurchaseSummary = { merchant: string; cents: number };
export const DEMO_PREVIOUS_PURCHASE: PurchaseSummary = { merchant: "walgreens.com", cents: 399 };

export type ShoppingOffer = PurchaseSummary & {
  quoteId: string;
  quoteToken: string;
  url: string;
  image?: string;
  productTitle?: string;
  kind?: string;
  productId?: string;
};

export type CatalogOffer = ShoppingOffer & { productTitle: string };
export const shoppingProductUrl = z.url({ protocol: /^https$/, hostname: z.regexes.domain }).max(2_048).pipe(z.string().refine((value) => {
  const url = new URL(value);
  return !url.username && !url.password;
}));
export const shoppingProductId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const productImage = z.url({ protocol: /^https$/, hostname: /^cdn\.trychannel3\.com$/ }).max(2_048);
// This pattern is also sent to OpenAI strict tools; Unicode property escapes are not accepted there.
export const shoppingProductKind = z.string().trim().min(1).max(60).regex(/^[A-Za-z0-9][A-Za-z0-9 '-]*$/);
/** Legacy cards did not store a kind. Recognize common types before using catalog categories. */
export function inferShoppingKind(value: string) {
  const types: Array<[RegExp, string]> = [
    [/toothpaste|牙膏/i, "Toothpaste"],
    [/\b(?:potato |tortilla )?chips\b|薯片/i, "Chips"],
    [/dish\s*(?:soap|wash|washing)|洗洁精/i, "Dish soap"],
    [/laundry\s*(?:detergent|soap)|洗衣液|洗衣粉/i, "Laundry detergent"],
    [/toilet\s*(?:paper|tissue)|卫生纸/i, "Toilet paper"],
    [/paper\s*towels?|厨房纸/i, "Paper towels"],
    [/shampoo|洗发水/i, "Shampoo"],
    [/body\s*wash|shower\s*gel|沐浴露/i, "Body wash"],
    [/drinking\s*water|bottled\s*water|mineral\s*water|矿泉水/i, "Drinking water"],
    [/\bcups?\b|\btumblers?\b|杯子/i, "Cup"],
  ];
  return types.find(([pattern]) => pattern.test(value))?.[1];
}
export const shoppingCardProduct = z.object({
  url: shoppingProductUrl,
  kind: shoppingProductKind.optional(),
  productId: shoppingProductId.optional(),
  image: productImage.optional(),
  generatedArt: z.object({
    data: z.string().max(1_400_000).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/),
    transparent: z.boolean(),
  }).optional(),
  lastPurchase: z.object({
    merchant: z.string().min(1).max(255),
    cents: z.int().positive().max(10_000),
    orderId: z.string().regex(/^[A-Z0-9]{10,32}$/),
  }).optional(),
});
export type ShoppingCardProduct = z.infer<typeof shoppingCardProduct>;

export function sameShoppingLink(first: string, second: string) {
  const a = new URL(first), b = new URL(second);
  if (a.hostname === "buy.trychannel3.com" && b.hostname === a.hostname) {
    const offer = a.searchParams.get("o");
    if (offer && offer === b.searchParams.get("o")) return true;
  }
  for (const url of [a, b]) {
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (key.startsWith("utm_")) url.searchParams.delete(key);
    }
    url.searchParams.sort();
  }
  return a.href === b.href;
}
export const shoppingComparison = z.object({
  query: z.string().min(1).max(240),
  offers: z.array(z.object({
    productTitle: z.string().min(1).max(200),
    kind: shoppingProductKind.optional(),
    merchant: z.string().min(1).max(255),
    cents: z.int().positive(),
    url: shoppingProductUrl,
    image: productImage.optional(),
    productId: shoppingProductId.optional(),
    quoteId: z.uuid(),
    quoteToken: z.string().max(SHOPPING_TOKEN_LIMIT),
  })).min(1).max(3),
});
export type ShoppingComparison = z.infer<typeof shoppingComparison>;

export type ShoppingReceipt = PurchaseSummary & {
  orderId: string;
  product?: ShoppingCardProduct & { title: string };
};

export function merchantName(domain: string) {
  return {
    "farmandfleet.com": "Blain’s Farm & Fleet",
    "walgreens.com": "Walgreens",
    "cvs.com": "CVS",
  }[domain] ?? domain;
}

export const shoppingPrice = (cents: number) => `US$${(cents / 100).toFixed(2)}`;

