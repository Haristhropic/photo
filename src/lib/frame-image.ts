import sharp from "sharp";

import type { Rect } from "./layouts";

/**
 * Administration accepts arbitrary frame artwork, so the upload path has to
 * discover where the photos belong. The supplied frames are PNGs with three
 * kinds of transparent pixels: the outside margin, the photo windows, and tiny
 * counters inside lettering. We only want the enclosed, rectangular regions.
 *
 * The algorithm treats alpha <= ALPHA_FLOOR as transparent, flood-fills from
 * the image border to mark the outside margin, then scans the remaining
 * transparent components. A photo window is a large component whose bounding
 * box is mostly filled; letter counters are too small and fall below the area
 * threshold.
 */
const ALPHA_FLOOR = 12;
const MAX_PIXELS = 24_000_000;
const MIN_AREA_RATIO = 0.005;
const MIN_FILL_RATIO = 0.7;

export type FrameAnalysis = {
  width: number;
  height: number;
  windows: Rect[];
};

export async function analyzeFramePng(bytes: Buffer): Promise<FrameAnalysis> {
  const { data, info } = await sharp(bytes, {
    limitInputPixels: MAX_PIXELS,
  })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const pixels = width * height;
  if (pixels === 0) {
    throw new Error("PNG tidak memiliki piksel");
  }

  const transparent = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i += 1) {
    transparent[i] = data[i * channels + 3] <= ALPHA_FLOOR ? 1 : 0;
  }

  // `seen` doubles as the outside mask and the visited set for windows. Every
  // border-connected transparent pixel is marked first, so any transparent
  // component left unvisited is enclosed by artwork or an opaque margin.
  const seen = new Uint8Array(pixels);
  const stack = new Int32Array(pixels);
  let stackSize = 0;

  const push = (index: number) => {
    if (seen[index] || !transparent[index]) return;
    seen[index] = 1;
    stack[stackSize] = index;
    stackSize += 1;
  };

  for (let x = 0; x < width; x += 1) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    push(y * width);
    push(y * width + width - 1);
  }

  while (stackSize > 0) {
    stackSize -= 1;
    const index = stack[stackSize];
    const x = index % width;
    const y = (index - x) / width;

    if (x > 0) push(index - 1);
    if (x < width - 1) push(index + 1);
    if (y > 0) push(index - width);
    if (y < height - 1) push(index + width);
  }

  const minArea = Math.max(2_500, pixels * MIN_AREA_RATIO);
  const windows: Rect[] = [];

  for (let start = 0; start < pixels; start += 1) {
    if (!transparent[start] || seen[start]) continue;

    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    seen[start] = 1;
    stack[0] = start;
    stackSize = 1;

    while (stackSize > 0) {
      stackSize -= 1;
      const index = stack[stackSize];
      const x = index % width;
      const y = (index - x) / width;

      area += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (x > 0) push(index - 1);
      if (x < width - 1) push(index + 1);
      if (y > 0) push(index - width);
      if (y < height - 1) push(index + width);
    }

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    if (area < minArea || w < 16 || h < 16) continue;

    const fill = area / (w * h);
    if (fill < MIN_FILL_RATIO) continue;

    windows.push({ x: minX, y: minY, w, h });
  }

  windows.sort((a, b) => a.y - b.y || a.x - b.x);

  return { width, height, windows };
}
