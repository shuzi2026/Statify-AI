import { z } from "zod";
import {
  SHOPPING_DEMO_PATH, shoppingCardProduct, shoppingProductId, shoppingProductUrl, type ShoppingCardProduct,
} from "../../shared/shopping-demo";
import { prepareProductArtwork } from "./product-cutout";

const artwork = z.object({
  productId: shoppingProductId.optional(),
  sourceUrl: shoppingProductUrl.optional(),
  image: shoppingCardProduct.shape.image,
  imageData: z.string().max(8_388_650).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/).optional(),
});
const maxBytes = 6 * 1024 * 1024;

async function downloadArtwork(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, credentials: "omit", referrerPolicy: "no-referrer", redirect: "error" });
  if (!response.ok || !response.body || Number(response.headers.get("Content-Length")) > maxBytes)
    throw Error("Product image could not be downloaded");
  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw Error("Product image is too large");
      chunks.push(new Uint8Array(value));
    }
    return new Blob(chunks);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function prepareShoppingArtwork(product: ShoppingCardProduct, name = product.kind): Promise<ShoppingCardProduct> {
  const request = new AbortController();
  const timeout = window.setTimeout(() => request.abort(), 25_000);
  try {
    const response = await fetch(SHOPPING_DEMO_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "card_artwork", product: { url: product.url, productId: product.productId }, name }),
      signal: request.signal,
    });
    if (!response.ok) return product;
    const result = artwork.parse(await response.json());
    const source = result.sourceUrl ?? result.image;
    const next = { ...product, productId: result.productId ?? product.productId, image: result.image ?? product.image };
    if (result.imageData) {
      const raw = atob(result.imageData.slice(result.imageData.indexOf(",") + 1));
      const blob = new Blob([Uint8Array.from(raw, (character) => character.charCodeAt(0))]);
      const art = await prepareProductArtwork(blob).catch(() => undefined);
      if (art?.transparent) return { ...next, generatedArt: art };
      next.generatedArt ??= art;
    }
    for (const candidate of new Set([source, result.image])) {
      if (!candidate || request.signal.aborted) continue;
      const art = await downloadArtwork(candidate, request.signal).then(prepareProductArtwork).catch(() => undefined);
      if (art?.transparent) return { ...next, generatedArt: art };
      next.generatedArt ??= art;
    }
    return next;
  } catch {
    return product;
  } finally {
    window.clearTimeout(timeout);
  }
}
