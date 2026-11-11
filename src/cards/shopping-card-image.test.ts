import { afterEach, expect, it, vi } from "vitest";
import { prepareShoppingArtwork } from "./shopping-card-image";
import { prepareProductArtwork } from "./product-cutout";
vi.mock("./product-cutout", () => ({ prepareProductArtwork: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

it("uses same-origin image bytes when the merchant/CDN cannot be read by a browser", async () => {
  vi.stubGlobal("window", globalThis);
  const art = { data: "data:image/png;base64,YQ==", transparent: true };
  vi.mocked(prepareProductArtwork).mockResolvedValue(art);
  const upstream = vi.fn(async () => Response.json({ productId: "paste", imageData: "data:image/png;base64,YQ==" }));
  vi.stubGlobal("fetch", upstream);
  const product = { productId: "paste", url: "https://shop.example/paste" };
  expect((await prepareShoppingArtwork(product)).generatedArt).toEqual(art);
  expect(upstream).toHaveBeenCalledOnce();
  expect(prepareProductArtwork).toHaveBeenCalledWith(expect.any(Blob));
});

it("passes a manually entered card name for fallback search and retains its original shopping link", async () => {
  vi.stubGlobal("window", globalThis);
  const art = { data: "data:image/png;base64,YQ==", transparent: true };
  vi.mocked(prepareProductArtwork).mockResolvedValue(art);
  const product = { url: "https://shop.example/chosen-chips" };
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    expect(JSON.parse(String(init.body))).toMatchObject({ name: "chips", product });
    return Response.json({ imageData: "data:image/png;base64,YQ==" });
  }));
  expect(await prepareShoppingArtwork(product, "chips")).toMatchObject({ ...product, generatedArt: art });
});
