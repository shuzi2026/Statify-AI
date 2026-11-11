import { storageRules, storageIO } from "../shared/rules/storage";
export const maxImportBytes = storageRules.maxImportBytes;
/** A successful handoff does not prove that an independent file was saved. */
export type DownloadHandoff = {
  status: "handoff";
  method: "share" | "download";
};
export async function download(
  text: string | Blob,
  name: string,
): Promise<DownloadHandoff> {
  if ((await import("@capacitor/core")).Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } =
      await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    let data: string, encoding: typeof Encoding.UTF8 | undefined;
    if (typeof text === "string") {
      data = text;
      encoding = Encoding.UTF8;
    } else {
      const bytes = new Uint8Array(await text.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += storageIO.base64ChunkBytes)
        binary += String.fromCharCode(
          ...bytes.subarray(i, i + storageIO.base64ChunkBytes),
        );
      data = btoa(binary);
    }
    const file = await Filesystem.writeFile({
      path: name,
      data,
      directory: Directory.Cache,
      ...(encoding ? { encoding } : {}),
    });
    await Share.share({
      title: "Statify 存档",
      files: [file.uri],
      dialogTitle: "保存或分享备份",
    });
    return { status: "handoff", method: "share" };
  }
  const url = URL.createObjectURL(
      typeof text === "string"
        ? new Blob([text], { type: "application/json" })
        : text,
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), storageIO.downloadUrlLifetimeMs);
  return { status: "handoff", method: "download" };
}
export async function gzip(text: string) {
  if (typeof CompressionStream === "undefined")
    throw Error("此设备暂不支持压缩备份，请导出完整备份");
  return new Response(
    new Blob([text]).stream().pipeThrough(new CompressionStream("gzip")),
  ).blob();
}
export async function readImportFile(file: Blob, name = "") {
  if (file.size > maxImportBytes) throw Error("存档不能超过64MB");
  const prefix = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const compressed = prefix[0] === 31 && prefix[1] === 139;
  if (!compressed && !name.endsWith(".gz")) return file.text();
  if (typeof DecompressionStream === "undefined")
    throw Error("此设备暂不支持解压，请使用JSON备份");
  const reader = file
      .stream()
      .pipeThrough(new DecompressionStream("gzip"))
      .getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxImportBytes) throw Error("解压后的存档不能超过64MB");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return new Blob(chunks as BlobPart[]).text();
}
