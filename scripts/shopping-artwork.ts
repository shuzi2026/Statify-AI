/** Download only catalog CDN images, without forwarding credentials or following redirects.
 * Returning bytes from our origin lets the browser cut out products without merchant CORS failures. */
export async function downloadCatalogArtwork(source: string | undefined): Promise<string | undefined> {
  if (!source) return;
  const url = new URL(source);
  if (url.protocol !== "https:" || url.hostname !== "cdn.trychannel3.com" || url.port || url.username || url.password) return;
  const response = await fetch(url.href, { redirect: "error", signal: AbortSignal.timeout(5_000) });
  const maxBytes = 6 * 1024 * 1024;
  if (!response.ok || !response.body || Number(response.headers.get("Content-Length")) > maxBytes) return;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) return;
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks);
  const mime = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png" :
    bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg" :
    bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : undefined;
  if (mime) return `data:${mime};base64,${bytes.toString("base64")}`;
}
