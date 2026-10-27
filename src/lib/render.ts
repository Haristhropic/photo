import { FILTERS, LAYOUTS, type FilterKey, type LayoutType } from "./layouts";
import {
  framePhotoSlots,
  frameSupportsLayout,
  preloadFrameImage,
  type FramePreset,
} from "./frames";
import {
  drawPhotoCover,
  type ShotTransform,
} from "./photo-transform";
import { STICKERS, drawSticker, type StickerKey } from "./stickers";

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

export async function renderStrip(options: {
  shots: string[];
  layoutType: LayoutType;
  filterKey: FilterKey;
  sticker: StickerKey | null;
  frame: FramePreset | null;
  eventLabel: string | null;
  transforms?: ShotTransform[];
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

  ctx.filter = FILTERS[filterKey].css;
  photoSlots.forEach((slot, i) => {
    const img = images[i];
    if (img) drawPhotoCover(ctx, img, slot, transforms?.[i]);
  });
  ctx.filter = "none";

  // The frame paints over the photo edges and the paper margin, the sticker is
  // slapped on the corner last, and the event label sits above both.
  if (frame) {
    frame.draw(ctx, layout);
  }

  if (sticker) {
    const lastSlot = photoSlots[photoSlots.length - 1];
    drawSticker(ctx, STICKERS[sticker], layout, {
      photoWidth: photoSlots[0]?.w,
      // Bitmap event frames have a large branded footer; keep the sticker on
      // the photo instead of covering the event art.
      bottom:
        frame?.bitmap && lastSlot
          ? lastSlot.y + lastSlot.h + 40
          : undefined,
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

  return canvas.toDataURL("image/png");
}
