import { FILTERS, LAYOUTS, STICKER_TEXT, type FilterKey, type LayoutType, type StickerKey } from "./layouts";

export type Draft = {
  shots: string[];
  layoutType: LayoutType;
  eventId: string | null;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gambar tidak bisa dimuat"));
    img.src = src;
  });
}

/** Draws a source image into a rect, cropping to fill and mirroring like the booth preview. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const sourceRatio = img.naturalWidth / img.naturalHeight;
  const targetRatio = w / h;

  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;

  if (sourceRatio > targetRatio) {
    sw = img.naturalHeight * targetRatio;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / targetRatio;
    sy = (img.naturalHeight - sh) / 2;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(x + w, y);
  ctx.scale(-1, 1);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  ctx.restore();
}

export async function renderStrip(options: {
  shots: string[];
  layoutType: LayoutType;
  filterKey: FilterKey;
  sticker: StickerKey | null;
  eventLabel: string | null;
}): Promise<string> {
  const { shots, layoutType, filterKey, sticker, eventLabel } = options;
  const layout = LAYOUTS[layoutType];
  const { w: width, h: height } = layout.canvas;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D tidak tersedia");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const images = await Promise.all(shots.slice(0, layout.shotCount).map(loadImage));

  ctx.filter = FILTERS[filterKey].css;
  layout.slots.forEach((slot, i) => {
    const img = images[i];
    if (img) drawCover(ctx, img, slot.x, slot.y, slot.w, slot.h);
  });
  ctx.filter = "none";

  const labels = [sticker ? STICKER_TEXT[sticker] : null, eventLabel].filter(
    (value): value is string => Boolean(value),
  );

  if (labels.length > 0) {
    const size = Math.max(18, Math.round(width / 34));
    ctx.font = `600 ${size}px "IBM Plex Mono", monospace`;
    ctx.textBaseline = "alphabetic";
    const baseline = height - size * 1.4;

    labels.forEach((text, i) => {
      const x = i === 0 ? size * 1.4 : width - size * 1.4;
      ctx.textAlign = i === 0 ? "left" : "right";
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillText(text, x + 2, baseline + 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(text, x, baseline);
    });
  }

  return canvas.toDataURL("image/png");
}
