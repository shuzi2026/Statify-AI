import { expect, it } from "vitest";
import { removeStudioBackdrop } from "./product-cutout";

function raster(size: number, paint: (x: number, y: number) => number[]): ImageData {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) data.set(paint(x, y), (y * size + x) * 4);
  }
  return { width: size, height: size, data, colorSpace: "srgb" };
}

it("removes the studio backdrop but preserves matching color inside the product", () => {
  const image = raster(20, (x, y) => {
    const onProduct = x >= 5 && x <= 14 && y >= 5 && y <= 14;
    const label = x >= 7 && x <= 11 && y >= 7 && y <= 11;
    return onProduct && !label ? [0, 80, 200, 255] : [255, 255, 255, 255];
  });
  expect(removeStudioBackdrop(image)).toBe(true);
  expect(image.data[3]).toBe(0);
  expect(image.data[(9 * 20 + 9) * 4 + 3]).toBe(255);
  expect(image.data[(5 * 20 + 5) * 4 + 3]).toBe(255);
});

it("keeps a nonuniform backdrop intact instead of cutting into the subject", () => {
  const image = raster(20, (x, y) => [x * 12, y * 12, 0, 255]);
  const before = image.data.slice();
  expect(removeStudioBackdrop(image)).toBe(false);
  expect(image.data).toEqual(before);
});
