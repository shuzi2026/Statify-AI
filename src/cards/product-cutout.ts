import { processCardImage } from "../themes/card-image";

const backgroundTolerance = 24;
const maxIconSize = 464;

/** Remove a mostly uniform studio backdrop without erasing enclosed details. */
export function removeStudioBackdrop({ data, width, height }: ImageData) {
  const size = width * height;
  const edge: number[] = [];
  for (let x = 0; x < width; x++) edge.push(x, size - width + x);
  for (let y = 1; y + 1 < height; y++) edge.push(y * width, y * width + width - 1);
  const alpha = (index: number) => data[index * 4 + 3];
  if (edge.filter((index) => alpha(index) < 16).length >= edge.length * 0.1)
    return true;

  const near = (index: number, sample: number) =>
    Math.max(
      Math.abs(data[index * 4] - data[sample * 4]),
      Math.abs(data[index * 4 + 1] - data[sample * 4 + 1]),
      Math.abs(data[index * 4 + 2] - data[sample * 4 + 2]),
    ) <= backgroundTolerance;
  let background = 0, support = 0;
  for (const sample of [0, width - 1, size - width, size - 1]) {
    const matches = edge.filter((index) => near(index, sample)).length;
    if (matches > support) {
      background = sample;
      support = matches;
    }
  }
  if (support < edge.length * 0.65) return false;

  const queue = new Uint32Array(size), visited = new Uint8Array(size);
  let tail = 0;
  function enqueue(index: number) {
    if (visited[index] || !near(index, background)) return;
    visited[index] = 1;
    queue[tail++] = index;
  }
  for (const index of edge) enqueue(index);
  for (let head = 0; head < tail; head++) {
    const index = queue[head];
    const x = index % width;
    if (x > 0) enqueue(index - 1);
    if (x < width - 1) enqueue(index + 1);
    if (index >= width) enqueue(index - width);
    if (index < size - width) enqueue(index + width);
  }
  if (tail < size * 0.05 || size - tail < size * 0.02) return false;
  for (let index = 0; index < tail; index++) data[queue[index] * 4 + 3] = 0;
  return true;
}

export function prepareProductArtwork(file: Blob) {
  return processCardImage(file, (image) => {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, maxIconSize / Math.max(image.naturalWidth, image.naturalHeight));
    const width = canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    const transparent = removeStudioBackdrop(pixels);
    if (!transparent) return encodeIcon(canvas, false);
    let left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (pixels.data[(y * width + x) * 4 + 3] < 16) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    if (right < left || bottom < top) return;
    const padding = Math.max(4, Math.round(Math.max(right - left, bottom - top) * 0.035));
    canvas.width = right - left + 1 + padding * 2;
    canvas.height = bottom - top + 1 + padding * 2;
    context.putImageData(pixels, padding - left, padding - top, left, top, right - left + 1, bottom - top + 1);
    return encodeIcon(canvas, true);
  });
}

function encodeIcon(canvas: HTMLCanvasElement, transparent: boolean) {
  const data = canvas.toDataURL("image/png");
  if (data.length <= 1_400_000 && data.startsWith("data:image/png;base64,"))
    return { data, transparent };
}
