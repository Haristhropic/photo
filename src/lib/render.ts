import {
  FILTERS,
  LAYOUTS,
  PAPER_MARGIN,
  PRINT_RADIUS,
  type FilterKey,
  type LayoutPreset,
  type LayoutType,
  type Rect,
} from "./layouts";
import {
  framePhotoSlots,
  frameSupportsLayout,
  preloadFrameImage,
  roundedRectPath,
  type FramePreset,
} from "./frames";
import {
  drawPhotoCover,
  drawPhotoFit,
  type ShotTransform,
} from "./photo-transform";
import {
  STICKERS,
  drawSticker,
  type StickerKey,
  type StickerSpot,
} from "./stickers";

export type Draft = {
  shots: string[];
  layoutType: LayoutType;
  eventId: string | null;
  /** Where the shots came from. Older drafts are treated as camera runs. */
  source?: "camera" | "upload";
  /** Optional per-shot focus/zoom; camera shots keep the centre cover crop. */
  transforms?: ShotTransform[];
  /** Live Photo metadata. Clip blobs stay in IndexedDB until save. */
  live?: { runId: string; slots: { slot: number; mime: string; durationMs: number }[] };
};

// The studio re-renders on every filter, sticker and frame change. Without a
// cache each click decoded the same camera shots again, so the preview blinked
// through a blank frame while the photos loaded. The largest layout has four
// shots, so four entries are enough for the current run; a retake evicts the
// previous guest's photos as the new ones load.
const MAX_CACHED_IMAGES = 4;
const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) {
    // Refresh insertion order so the current run stays in the cache.
    imageCache.delete(src);
    imageCache.set(src, cached);
    return cached;
  }

  const img = new Image();
  // `onload` can fire before the bitmap is ready to paint in some browsers,
  // which produced strips with an empty slot. `decode()` resolves only once
  // the pixels can be drawn; keep the event path for browsers without it.
  const pending =
    typeof img.decode === "function"
      ? (() => {
          img.src = src;
          return img.decode().then(() => img);
        })()
      : new Promise<HTMLImageElement>((resolve, reject) => {
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Gambar tidak bisa dimuat"));
          img.src = src;
        });

  imageCache.set(src, pending);
  while (imageCache.size > MAX_CACHED_IMAGES) {
    const oldest = imageCache.keys().next().value;
    if (oldest === undefined || oldest === src) break;
    imageCache.delete(oldest);
  }
  // A failed decode must not stay cached; the next change can retry it.
  pending.catch(() => {
    if (imageCache.get(src) === pending) imageCache.delete(src);
  });
  return pending;
}

/* -------------------------------------------------------------------------- */
/* photo slot geometry                                                         */
/* -------------------------------------------------------------------------- */

/** How close a slot edge must sit to the paper margin to count as "outer". */
const PAPER_EDGE_TOLERANCE = 1.5;

type CornerRadii = { tl: number; tr: number; br: number; bl: number };

/**
 * Cut the canvas down to the print's silhouette. Everything the renderer
 * paints - paper, photos, frame art, sticker - is clipped by this path, so the
 * preview, the exported PNG and the result page all share one corner shape.
 * The radius is twice the paper margin, which puts it on the same centre as
 * the photo's own corner and keeps the paper band an even width around it.
 */
function clipToPrint(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  roundedRectPath(
    ctx,
    0,
    0,
    width,
    height,
    Math.min(PRINT_RADIUS, width / 2, height / 2),
  );
  ctx.clip();
}

/**
 * Photos that sit against the paper margin take the margin's curve at their
 * outer corners. The strip is clipped with a radius of twice the margin, so a
 * square photo corner leaves a thinner band of paper at the corner than along
 * the edges. Rounding the corner by the margin keeps that band an even width,
 * which is what makes the photo and the frame read as one shape.
 *
 * Slots that are flush with the canvas edge, or inset well past the margin,
 * keep square corners: they belong to a frame artwork, not to the paper.
 */
function photoSlotRadii(slot: Rect, canvas: { w: number; h: number }): CornerRadii {
  const onEdge = (inset: number) =>
    Math.abs(inset - PAPER_MARGIN) <= PAPER_EDGE_TOLERANCE;
  const radius = Math.min(PAPER_MARGIN, slot.w / 2, slot.h / 2);

  const left = onEdge(slot.x);
  const right = onEdge(canvas.w - (slot.x + slot.w));
  const top = onEdge(slot.y);
  const bottom = onEdge(canvas.h - (slot.y + slot.h));

  return {
    tl: left && top ? radius : 0,
    tr: right && top ? radius : 0,
    br: right && bottom ? radius : 0,
    bl: left && bottom ? radius : 0,
  };
}

function photoSlotPath(
  ctx: CanvasRenderingContext2D,
  slot: Rect,
  { tl, tr, br, bl }: CornerRadii,
): void {
  const { x, y, w, h } = slot;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

/**
 * How a sticker is sized and how low it may hang for a given frame. Bitmap
 * event frames have a large branded footer, so the default spot sits on the
 * last photo instead of covering the event art.
 */
export function stickerAnchors(
  frame: FramePreset | null,
  layout: LayoutPreset,
): { photoWidth?: number; bottom?: number } {
  const slots = frame ? framePhotoSlots(frame, layout) : layout.slots;
  const last = slots[slots.length - 1];
  return {
    photoWidth: slots[0]?.w,
    bottom: frame?.bitmap && last ? last.y + last.h + 40 : undefined,
  };
}

export async function renderStrip(options: {
  shots: string[];
  layoutType: LayoutType;
  filterKey: FilterKey;
  sticker: StickerKey | null;
  /** Guest-dragged sticker position; null keeps the default corner spot. */
  stickerSpot?: StickerSpot | null;
  frame: FramePreset | null;
  eventLabel: string | null;
  transforms?: ShotTransform[];
  /** Which flow produced the shots. Camera shots get the safe fit crop. */
  source?: "camera" | "upload";
}): Promise<string> {
  const { shots, layoutType, filterKey, sticker, eventLabel, transforms } =
    options;
  const layout = LAYOUTS[layoutType];
  const { w: width, h: height } = layout.canvas;

  // A frame that only supports another layout is ignored rather than drawn in
  // the wrong place; the picker filters these out anyway.
  const requestedFrame = options.frame;
  const frame =
    requestedFrame && frameSupportsLayout(requestedFrame, layoutType)
      ? requestedFrame
      : null;
  // Bitmap frames define their own transparent windows, so the photos go there
  // instead of the layout's slots.
  const photoSlots = frame ? framePhotoSlots(frame, layout) : layout.slots;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D tidak tersedia");

  // The print's rounded silhouette is baked in, not applied by CSS, so the
  // exported PNG matches the studio exactly.
  ctx.save();
  clipToPrint(ctx, width, height);

  // Sticker artwork is set in the app's display face; wait for it so the PNG
  // never bakes a fallback font that the live DOM has already replaced.
  if (typeof document !== "undefined" && document.fonts) {
    await document.fonts.ready;
  }

  ctx.fillStyle = frame?.paperColor ?? "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const imagesPromise = Promise.all(
    shots.slice(0, photoSlots.length).map(loadImage),
  );
  // Start the bitmap frame load alongside the photos; both must be ready
  // before the compositor runs.
  const framePromise = frame?.bitmap
    ? preloadFrameImage(frame.bitmap.src)
    : Promise.resolve();
  const images = await imagesPromise;
  await framePromise;

  const filterCss = FILTERS[filterKey].css;
  const isCameraRun = options.source !== "upload";

  ctx.filter = filterCss;
  photoSlots.forEach((slot, i) => {
    const img = images[i];
    if (!img) return;
    // The rounded outer corners are part of the print, not just the preview:
    // the PNG, the QR page and the gallery all share this canvas.
    ctx.save();
    photoSlotPath(ctx, slot, photoSlotRadii(slot, layout.canvas));
    ctx.clip();
    // Uploads carry an explicit focus/zoom, so honour their cover crop. Camera
    // shots were framed inside the 4:3 preview and have no crop control, so
    // fit the whole frame instead of guessing which edge to cut off.
    if (isCameraRun) {
      drawPhotoFit(ctx, img, slot, filterCss, transforms?.[i]);
    } else {
      drawPhotoCover(ctx, img, slot, transforms?.[i]);
    }
    ctx.restore();
  });
  ctx.filter = "none";

  // The frame paints over the photo edges and the paper margin, the sticker is
  // slapped on the corner last, and the event label sits above both.
  if (frame) {
    frame.draw(ctx, layout);
  }

  if (sticker) {
    drawSticker(ctx, STICKERS[sticker], layout, {
      ...stickerAnchors(frame, layout),
      spot: options.stickerSpot,
    });
  }

  if (eventLabel) {
    const size = Math.max(18, Math.round(width / 34));
    ctx.font = `600 ${size}px "IBM Plex Mono", monospace`;
    ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round";
    // The label straddles the last photo and the paper margin, so it prints as
    // ink with a paper halo instead of white text that vanishes on the margin.
    ctx.lineWidth = Math.max(4, Math.round(size * 0.2));
    ctx.strokeStyle = "#ffffff";
    ctx.textAlign = "right";
    const x = width - size * 1.4;
    const baseline = height - size * 1.4;
    ctx.strokeText(eventLabel, x, baseline);
    ctx.fillStyle = "#241428";
    ctx.fillText(eventLabel, x, baseline);
  }

  ctx.restore();
  return canvas.toDataURL("image/png");
}

/**
 * Stamp a guest-dragged sticker onto an already rendered strip.
 *
 * The studio keeps the preview free of the sticker so the DOM layer can move
 * without re-rendering four photos on every pointer move. At save time the
 * same geometry is painted onto the cached PNG, which means the overlay the
 * guest positioned is exactly what gets uploaded.
 */
export async function addStickerToStrip(options: {
  base: string;
  sticker: StickerKey;
  layoutType: LayoutType;
  frame: FramePreset | null;
  spot?: StickerSpot | null;
}): Promise<string> {
  const layout = LAYOUTS[options.layoutType];
  const image = await loadImage(options.base);

  const canvas = document.createElement("canvas");
  canvas.width = layout.canvas.w;
  canvas.height = layout.canvas.h;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D tidak tersedia");

  // Keep the sticker inside the print: a dragged sticker can hang over the
  // paper edge, and the saved corner must stay the one the preview shows.
  ctx.save();
  clipToPrint(ctx, canvas.width, canvas.height);

  // The base already carries the paper, photos, frame and any filter, so the
  // sticker is the only new ink. Draw at natural size to avoid a resample.
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  if (typeof document !== "undefined" && document.fonts) {
    await document.fonts.ready;
  }

  const requestedFrame = options.frame;
  const frame =
    requestedFrame &&
    frameSupportsLayout(requestedFrame, options.layoutType)
      ? requestedFrame
      : null;

  drawSticker(ctx, STICKERS[options.sticker], layout, {
    ...stickerAnchors(frame, layout),
    spot: options.spot,
  });

  ctx.restore();
  return canvas.toDataURL("image/png");
}
