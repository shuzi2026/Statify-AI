import { afterEach, expect, it, vi } from "vitest";
import { downloadCatalogArtwork } from "../../scripts/shopping-artwork";
import { createShoppingDemo } from "../../scripts/shopping-demo";
afterEach(() => vi.unstubAllGlobals());
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);

it("finds an illustrative image by card name after lookup fails, preserving the user's product identity", async () => {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/lookup")) return new Response("", { status: 504 });
    if (url.endsWith("/search")) {
      expect(JSON.parse(String(init?.body))).toMatchObject({ query: "chips" });
      return Response.json({ products: [{ id: "illustration", title: "Potato chips", offers: [],
        images: [{ url: "https://cdn.trychannel3.com/chips" }] }] });
    }
    expect(url).toBe("https://cdn.trychannel3.com/chips");
    return new Response(png);
  });
  vi.stubGlobal("fetch", fetcher);
  const result = await createShoppingDemo("secret")({ action: "card_artwork", name: "chips",
    product: { url: "https://shop.example/original-chips" } }, "https://demo.example");
  expect(result).toMatchObject({ status: 200, body: { image: "https://cdn.trychannel3.com/chips",
    imageData: expect.stringMatching(/^data:image\/png;base64,/) } });
  expect("productId" in result.body && result.body.productId).toBeUndefined();
});

it("delivers catalog image bytes through our API without forwarding any credentials", async () => {
  const upstream = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("https://api.trychannel3.com/")) return Response.json({
      id: "paste", title: "Toothpaste", offers: [], images: [{ url: "https://cdn.trychannel3.com/paste" }],
    });
    expect(url).toBe("https://cdn.trychannel3.com/paste");
    expect(init?.headers).toBeUndefined();
    expect(init?.redirect).toBe("error");
    return new Response(png);
  });
  vi.stubGlobal("fetch", upstream);
  const handle = createShoppingDemo("secret");
  expect(await handle({ action: "card_artwork", product: { productId: "paste", url: "https://shop.example/paste" } }, "https://demo.example"))
    .toMatchObject({ status: 200, body: { imageData: `data:image/png;base64,${Buffer.from(png).toString("base64")}` } });
  expect(upstream).toHaveBeenCalledTimes(2);
});

it("rejects arbitrary image hosts, credentials, ports and oversized or non-raster payloads", async () => {
  const upstream = vi.fn(async () => new Response("<svg>untrusted</svg>"));
  vi.stubGlobal("fetch", upstream);
  for (const url of ["https://127.0.0.1/test", "https://cdn.trychannel3.com.evil.test/a", "http://cdn.trychannel3.com/a",
    "https://user:pass@cdn.trychannel3.com/a", "https://cdn.trychannel3.com:444/a"])
    expect(await downloadCatalogArtwork(url)).toBeUndefined();
  expect(upstream).not.toHaveBeenCalled();
  expect(await downloadCatalogArtwork("https://cdn.trychannel3.com/a")).toBeUndefined();
  upstream.mockImplementation(async () => new Response(png, { headers: { "Content-Length": "7000000" } }));
  expect(await downloadCatalogArtwork("https://cdn.trychannel3.com/a")).toBeUndefined();
});
