import { afterEach, expect, test, vi } from "vitest";
import { createShoppingDemo } from "../../scripts/shopping-demo";
afterEach(() => vi.unstubAllGlobals());
const origin = "http://127.0.0.1:15286";
const makeProduct = (id: string, brand: string, title = `${brand} Toothpaste`, price = 5) => ({
  id, title, brands: [{ id: brand, name: brand }], category: { title: "Toothpaste" },
  offers: [{ domain: "shop.example", price: { price, currency: "USD" }, availability: "InStock", url: `https://shop.example/${id}` }],
});
const input = { action: "quotes", compare: true, product: {
  productId: "old", url: "https://shop.example/old", kind: "Toothpaste",
} };

test("searches only the kind and prefers different brands, not three retailers of the saved product", async () => {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    expect(url).toBe("https://api.trychannel3.com/v1/search");
    expect(JSON.parse(String(init?.body))).toMatchObject({ query: "Toothpaste", limit: 30 });
    return Response.json({ products: [makeProduct("toms1", "Toms"), makeProduct("toms2", "Toms"),
      makeProduct("colgate", "Colgate"), makeProduct("crest", "Crest"),
      makeProduct("holder", "Other", "Toothpaste holder"), makeProduct("expensive", "Other", "Toothpaste", 101)] });
  });
  vi.stubGlobal("fetch", fetcher);
  const result = await createShoppingDemo("catalog", { clientId: "client", secret: "secret" })(input, origin);
  expect(result).toMatchObject({ status: 200, body: { kind: "Toothpaste", hasMore: true,
    offers: [{ productId: "toms1" }, { productId: "colgate" }, { productId: "crest" }] } });
  expect(fetcher).toHaveBeenCalledOnce();
  if (!("offers" in result.body) || !result.body.offers) throw Error("Expected offers");
  expect(result.body.offers.every((offer) => !!offer.quoteToken)).toBe(true);
});

test("refresh excludes already displayed products and advances catalog pages instead of shuffling the same three", async () => {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return Response.json(body.page_token ? { products: [makeProduct("new", "New brand")] } : {
      products: [makeProduct("a", "A"), makeProduct("b", "B"), makeProduct("c", "C")], next_page_token: "page-two",
    });
  });
  vi.stubGlobal("fetch", fetcher);
  const handle = createShoppingDemo("catalog");
  expect(await handle(input, origin)).toMatchObject({ status: 200, body: { pageToken: "page-two", hasMore: true } });
  expect(await handle({ ...input, exclude: ["a", "b", "c"], pageToken: "page-two" }, origin))
    .toMatchObject({ status: 200, body: { hasMore: false, offers: [{ productId: "new" }] } });
  expect(await handle({ ...input, exclude: ["a", "b", "c", "new"], pageToken: "page-two" }, origin))
    .toMatchObject({ status: 200, body: { hasMore: false, offers: [] } });
});

test("legacy branded toothpaste cards are broadened to the type before searching", async () => {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/products/old")) return Response.json(makeProduct("old", "Toms", "Tom's of Maine Toothpaste 4.5oz"));
    expect(JSON.parse(String(init?.body)).query).toBe("Toothpaste");
    return Response.json({ products: [makeProduct("colgate", "Colgate"), makeProduct("crest", "Crest"), makeProduct("toms", "Toms")] });
  });
  vi.stubGlobal("fetch", fetcher);
  const result = await createShoppingDemo("catalog")({ ...input, product: { url: input.product.url, productId: "old" } }, origin);
  expect(result).toMatchObject({ status: 200, body: { kind: "Toothpaste", offers: [
    { productId: "colgate" }, { productId: "crest" }, { productId: "toms" },
  ] } });
});
