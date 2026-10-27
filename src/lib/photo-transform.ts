import type { Rect } from "./layouts";

/**
 * Where an uploaded photo sits inside a frame window.
 *
 * The values are deliberately normalised rather than stored in slot pixels:
 * the same shot can be rendered into a layout slot, an admin frame's transparent
 * window, or the cropper preview without recalculating a crop. `focusX` and
 * `focusY` are the point of the source image the guest wants to keep in view;
 * `zoom` is a multiplier over the normal cover crop.
 */
export type ShotTransform = {
  focusX: number;
  focusY: number;
  zoom: number;
};

export const DEFAULT_SHOT_TRANSFORM: ShotTransform = {
  focusX: 0.5,
  focusY: 0.5,
  zoom: 1,
};

export const MIN_SHOT_ZOOM = 1;
export const MAX_SHOT_ZOOM = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Sanitises a draft read from storage and the values a cropper hands back. */
export function normalizeShotTransform(value: unknown): ShotTransform {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    focusX: clamp(finiteOr(record.focusX, 0.5), 0, 1),
    focusY: clamp(finiteOr(record.focusY, 0.5), 0, 1),
    zoom: clamp(
      finiteOr(record.zoom, 1),
      MIN_SHOT_ZOOM,
      MAX_SHOT_ZOOM,
    ),
  };
}

export type PhotoCrop = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * The source rectangle that fills a target aspect ratio at the requested zoom
 * and focus. Shared by the renderer and the cropper so the preview and the
 * exported PNG cannot disagree.
 */
export function photoCoverCrop(
  sourceW: number,
  sourceH: number,
  targetRatio: number,
  transform?: unknown,
): PhotoCrop {
  if (sourceW <= 0 || sourceH <= 0 || targetRatio <= 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }

  const { focusX, focusY, zoom } = normalizeShotTransform(transform);
  const sourceRatio = sourceW / sourceH;

  let baseW: number;
  let baseH: number;
  if (sourceRatio > targetRatio) {
    baseH = sourceH;
    baseW = sourceH * targetRatio;
  } else {
    baseW = sourceW;
    baseH = sourceW / targetRatio;
  }

  const cropW = baseW / zoom;
  const cropH = baseH / zoom;
  const x = clamp(focusX * sourceW - cropW / 2, 0, sourceW - cropW);
  const y = clamp(focusY * sourceH - cropH / 2, 0, sourceH - cropH);

  return { x, y, w: cropW, h: cropH };
}

/**
 * Paints a photo into a rectangle using the same cover crop as the camera flow,
 * then applies the guest's focus point and zoom.
 *
 * The base crop is calculated exactly like the old `drawCover`: the image fills
 * the slot and the overflow is centred. Zoom shrinks that crop, and the focus
 * point moves it within the remaining source pixels. Clamping keeps the crop
 * inside the image, so a drag can never reveal an empty edge.
 */
export function drawPhotoCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  rect: Rect,
  transform?: unknown,
): void {
  const sourceW = img.naturalWidth;
  const sourceH = img.naturalHeight;
  if (sourceW <= 0 || sourceH <= 0 || rect.w <= 0 || rect.h <= 0) return;

  const crop = photoCoverCrop(sourceW, sourceH, rect.w / rect.h, transform);
  if (crop.w <= 0 || crop.h <= 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.drawImage(
    img,
    crop.x,
    crop.y,
    crop.w,
    crop.h,
    rect.x,
    rect.y,
    rect.w,
    rect.h,
  );
  ctx.restore();
}
