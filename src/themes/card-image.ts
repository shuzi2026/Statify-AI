export async function processCardImage<T>(file: Blob, process: (image: HTMLImageElement) => T): Promise<T> {
  if (!file.size) throw Error("图片为空，请重新选择。");
  if (file.size > 30 * 1024 * 1024)
    throw Error("图片过大，请选择30MB以内的图片。");
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png =
    header[0] === 137 &&
    header[1] === 80 &&
    header[2] === 78 &&
    header[3] === 71;
  const jpeg = header[0] === 255 && header[1] === 216 && header[2] === 255;
  const webp =
    String.fromCharCode(...header.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...header.slice(8, 12)) === "WEBP";
  if (!png && !jpeg && !webp) throw Error("请选择PNG、JPG或WebP图片。");
  const url = URL.createObjectURL(file),
    image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(Error("图片无法读取，请换一张图片重试。"));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight)
      throw Error("图片无法读取，请换一张图片重试。");
    return process(image);
  } finally {
    image.onload = null;
    image.onerror = null;
    URL.revokeObjectURL(url);
  }
}

/** Decode before saving; phone photos are downsampled to a bounded local asset. */
export function prepareCardImage(file: File): Promise<string> {
  return processCardImage(file, (image) => {
    let scale = Math.min(
      1,
      1024 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas"),
      context = canvas.getContext("2d");
    if (!context) throw Error("当前设备无法处理图片，请重试。");
    for (let attempt = 0; attempt < 4; attempt++) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/webp", 0.86 - attempt * 0.08);
      // A browser without WebP encoding returns PNG. Both are accepted by CardSchema.
      if (
        data.length <= 1400000 &&
        /^data:image\/(png|jpeg|webp);base64,/.test(data)
      )
        return data;
      scale *= 0.7;
    }
    throw Error("图片处理后仍过大，请换一张图片重试。");
  });
}
