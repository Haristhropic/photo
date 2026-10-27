import { cloudinaryImageUrl } from "./image-url";
import type { LayoutPreset, LayoutType, Rect } from "./layouts";

/**
 * Built-in frame artwork.
 *
 * Most frames are painted with canvas primitives so the picker swatch, the live
 * preview and the exported PNG all run the same code at any layout size. The
 * two RTS event frames are admin-managed bitmap overlays: their photo windows
 * are transparent holes in a Cloudinary PNG, so the renderer paints the photos
 * into those windows before it lays the art on top. Literal colours are
 * required: a canvas context cannot read the CSS custom properties the rest of
 * the app paints with.
 *
 * Layout rule: keep the bottom 70px and the outer 34px of each side free of
 * key artwork. renderStrip prints the event label there, and the optional
 * sticker is stuck on top at the bottom-left corner.
 */

const INK = "#241428";
const PAPER = "#fffdf8";
const CREAM = "#fdf3e3";
const PINK = "#ff3d8b";
const ORANGE = "#ff7a1a";
const BUTTER = "#ffd23f";
const MINT = "#3dd9a0";
const SKY = "#3da5f5";
const PLUM = "#7b2d8e";

export const FRAME_CATEGORIES = ["cute", "funny", "horror", "cool", "race"] as const;

export type FrameCategory = (typeof FRAME_CATEGORIES)[number];

export const FRAME_CATEGORY_LABEL: Record<FrameCategory, string> = {
  cute: "Cute",
  funny: "Funny",
  horror: "Horror",
  cool: "Cool",
  race: "Race",
};

export type BuiltInFrameKey =
  | "pita"
  | "kucing"
  | "mata"
  | "spidol"
  | "hantu"
  | "neon"
  | "balap";

/** Built-in keys, admin-managed database frames (`db:<uuid>`), and the
 *  guest-built frame in the studio (`custom`). */
export type FrameKey = BuiltInFrameKey | "custom" | `db:${string}`;

/**
 * A bitmap frame overlay. `design` and `windows` are in the source PNG's
 * pixels; `windows` are the transparent photo holes, not the layout slots.
 */
export type FrameBitmap = {
  src: string;
  swatchSrc: string;
  design: { w: number; h: number };
  windows: Rect[];
};

export type FramePreset = {
  key: FrameKey;
  name: string;
  category: FrameCategory;
  blurb: string;
  /** Layouts this frame is designed for; omit to offer it everywhere. */
  layouts?: readonly LayoutType[];
  /** Set for supplied bitmap frames; see FrameBitmap. */
  bitmap?: FrameBitmap;
  /** Paper colour painted behind the photos. Omitted means white. */
  paperColor?: string;
  draw: (ctx: CanvasRenderingContext2D, layout: LayoutPreset) => void;
};

/* -------------------------------------------------------------------------- */
/* primitives                                                                  */
/* -------------------------------------------------------------------------- */

function rrPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function paint(
  ctx: CanvasRenderingContext2D,
  fill: string | null,
  stroke: string | null,
  lineWidth = 0,
): void {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

/** A flat border ring: four rects, so corners are never double-painted. */
function ring(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  thickness: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, thickness);
  ctx.fillRect(0, h - thickness, w, thickness);
  ctx.fillRect(0, thickness, thickness, h - thickness * 2);
  ctx.fillRect(w - thickness, thickness, thickness, h - thickness * 2);
}

function innerRule(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  inset: number,
  lineWidth: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(inset + lineWidth / 2, inset + lineWidth / 2, w - 2 * inset - lineWidth, h - 2 * inset - lineWidth);
}

function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function heart(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  fill: string,
  stroke: string | null,
  lineWidth = 0,
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.62);
  ctx.bezierCurveTo(cx - s * 0.98, cy, cx - s * 0.62, cy - s * 0.82, cx, cy - s * 0.3);
  ctx.bezierCurveTo(cx + s * 0.62, cy - s * 0.82, cx + s * 0.98, cy, cx, cy + s * 0.62);
  ctx.closePath();
  paint(ctx, fill, stroke, lineWidth);
}

function paw(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  fill: string,
  rotation = 0,
  stroke: string | null = null,
  lineWidth = 0,
): void {
  const toes: Array<[number, number]> = [
    [-0.58, -0.28],
    [-0.2, -0.58],
    [0.2, -0.58],
    [0.58, -0.28],
  ];
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(r * 0.6, r * 0.3);
    ctx.ellipse(0, r * 0.3, r * 0.6, r * 0.5, 0, 0, Math.PI * 2);
    for (const [dx, dy] of toes) {
      ctx.moveTo(dx * r + r * 0.24, dy * r);
      ctx.arc(dx * r, dy * r, r * 0.24, 0, Math.PI * 2);
    }
  };

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  outline();
  if (stroke) {
    // Stroke first, fill over: the pad and toes merge into one silhouette.
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  outline();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

function bolt(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  rotation: number,
  fill: string,
  glow: number,
): void {
  const points: Array<[number, number]> = [
    [0.08, -1],
    [0.62, -1],
    [0.34, -0.28],
    [0.74, -0.28],
    [0.02, 1],
    [0.26, 0.14],
    [-0.12, 0.14],
  ];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.beginPath();
  points.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x * s, y * s);
    else ctx.lineTo(x * s, y * s);
  });
  ctx.closePath();
  ctx.fillStyle = fill;
  if (glow > 0) {
    ctx.shadowColor = withAlpha(fill, 0.55);
    ctx.shadowBlur = glow;
    ctx.fill();
  }
  ctx.fill();
  ctx.restore();
}

function sparkle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  fill: string,
  glow = 0,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(s * 0.14, -s * 0.14, s, 0);
  ctx.quadraticCurveTo(s * 0.14, s * 0.14, 0, s);
  ctx.quadraticCurveTo(-s * 0.14, s * 0.14, -s, 0);
  ctx.quadraticCurveTo(-s * 0.14, -s * 0.14, 0, -s);
  ctx.closePath();
  ctx.fillStyle = fill;
  if (glow > 0) {
    ctx.shadowColor = withAlpha(fill, 0.55);
    ctx.shadowBlur = glow;
    ctx.fill();
  }
  ctx.fill();
  ctx.restore();
}

/** A wobbly marker stroke. Deterministic: the same frame never jitters. */
function markerLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lineWidth: number,
  color: string,
  wobble = 2.4,
  phase = 0,
): void {
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length < 1) return;
  const nx = -(y2 - y1) / length;
  const ny = (x2 - x1) / length;
  const steps = Math.max(3, Math.round(length / 26));
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const offset = Math.sin(t * Math.PI * 3.2 + phase) * wobble;
    const px = x1 + (x2 - x1) * t + nx * offset;
    const py = y1 + (y2 - y1) * t + ny * offset;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

/* -------------------------------------------------------------------------- */
/* bitmap frame assets                                                         */
/* -------------------------------------------------------------------------- */

const frameImageCache = new Map<string, HTMLImageElement>();
const frameImageLoads = new Map<string, Promise<HTMLImageElement>>();

function loadFrameImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  // Cloudinary assets are cross-origin. Requesting them in CORS mode is what
  // keeps the canvas untainted when the studio exports the PNG.
  if (/^https?:\/\//i.test(src)) {
    image.crossOrigin = "anonymous";
  }
  // `onload` can fire before the bitmap is paintable in some browsers. Wait
  // for decode(), same as the photo loader in render.ts.
  if (typeof image.decode === "function") {
    image.src = src;
    return image.decode().then(() => image);
  }
  return new Promise((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Frame tidak bisa dimuat"));
    image.src = src;
  });
}

/** Load a bitmap frame before renderStrip paints it. Cached per source. */
export function preloadFrameImage(src: string): Promise<HTMLImageElement> {
  const cached = frameImageCache.get(src);
  if (cached) return Promise.resolve(cached);

  let pending = frameImageLoads.get(src);
  if (!pending) {
    pending = loadFrameImage(src)
      .then((image) => {
        frameImageCache.set(src, image);
        return image;
      })
      .finally(() => {
        frameImageLoads.delete(src);
      });
    frameImageLoads.set(src, pending);
  }
  return pending;
}

export function getFrameImage(src: string): HTMLImageElement | null {
  const image = frameImageCache.get(src);
  return image && image.complete && image.naturalWidth > 0 ? image : null;
}

/* -------------------------------------------------------------------------- */
/* cute                                                                        */
/* -------------------------------------------------------------------------- */

function drawPita(ctx: CanvasRenderingContext2D, layout: LayoutPreset): void {
  const { w, h } = layout.canvas;
  const u = w / 900;
  const band = 22 * u;

  ring(ctx, w, h, band, PINK);

  // Polka dots sit inside the ring only.
  ctx.fillStyle = PAPER;
  const step = 30 * u;
  for (let y = band / 2; y < h; y += step) {
    for (let x = band / 2; x < w; x += step) {
      const onRing = x < band || x > w - band || y < band || y > h - band;
      if (!onRing) continue;
      ctx.beginPath();
      ctx.arc(x, y, 4.6 * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  innerRule(ctx, w, h, band, 3.5 * u, INK);

  drawBow(ctx, 122 * u, 118 * u, 56 * u);

  heart(ctx, w - 84 * u, 92 * u, 30 * u, PINK, INK, 4 * u);
}

function drawBow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
): void {
  const ink = Math.max(3, r * 0.12);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Tails first, behind the loops: a ribbon end with a V notch.
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(dir * r * 0.2, r * 0.16);
    ctx.lineTo(dir * r * 0.64, r * 1.02);
    ctx.lineTo(dir * r * 0.44, r * 0.86);
    ctx.lineTo(dir * r * 0.26, r * 1.08);
    ctx.quadraticCurveTo(dir * r * 0.1, r * 0.6, dir * r * 0.02, r * 0.3);
    ctx.closePath();
    paint(ctx, BUTTER, INK, ink);
  }

  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.rotate(-dir * 0.12);
    ctx.beginPath();
    ctx.ellipse(dir * r * 0.56, -r * 0.04, r * 0.6, r * 0.42, 0, 0, Math.PI * 2);
    paint(ctx, PAPER, INK, ink);
    ctx.beginPath();
    ctx.moveTo(dir * r * 0.24, 0);
    ctx.quadraticCurveTo(dir * r * 0.55, -r * 0.06, dir * r * 0.8, -r * 0.28);
    ctx.strokeStyle = "rgba(36,20,40,0.2)";
    ctx.lineWidth = ink * 0.7;
    ctx.stroke();
    ctx.restore();
  }

  rrPath(ctx, -r * 0.26, -r * 0.36, r * 0.52, r * 0.7, r * 0.17);
  paint(ctx, PINK, INK, ink);

  ctx.beginPath();
  ctx.arc(-r * 0.58, -r * 0.14, r * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.fill();
  ctx.restore();
}

function drawKucing(ctx: CanvasRenderingContext2D, layout: LayoutPreset): void {
  const { w, h } = layout.canvas;
  const u = w / 900;
  const band = 28 * u;

  ring(ctx, w, h, band, MINT);

  paw(ctx, 0.2 * w, band * 0.5, 11 * u, PAPER, -0.2, INK, 1.8 * u);
  paw(ctx, 0.36 * w, band * 0.5, 11 * u, PAPER, 0.25, INK, 1.8 * u);
  paw(ctx, 15 * u, 0.32 * h, 11 * u, PAPER, -0.5, INK, 1.8 * u);
  paw(ctx, 15 * u, 0.56 * h, 11 * u, PAPER, 0.4, INK, 1.8 * u);
  paw(ctx, 15 * u, 0.78 * h, 11 * u, PAPER, -0.3, INK, 1.8 * u);
  paw(ctx, w - 15 * u, 0.44 * h, 11 * u, PAPER, 0.5, INK, 1.8 * u);
  paw(ctx, w - 15 * u, 0.68 * h, 11 * u, PAPER, -0.4, INK, 1.8 * u);

  innerRule(ctx, w, h, band, 3 * u, INK);

  drawCat(ctx, w - 108 * u, 118 * u, 54 * u);
}

function drawCat(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
): void {
  const ink = r * 0.12;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(dir * r * 0.18, -r * 0.72);
    ctx.lineTo(dir * r * 0.88, -r * 1.16);
    ctx.lineTo(dir * r * 0.9, -r * 0.3);
    ctx.closePath();
    paint(ctx, BUTTER, INK, ink);

    ctx.beginPath();
    ctx.moveTo(dir * r * 0.38, -r * 0.68);
    ctx.lineTo(dir * r * 0.76, -r * 0.94);
    ctx.lineTo(dir * r * 0.77, -r * 0.46);
    ctx.closePath();
    paint(ctx, PINK, null);
  }

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  paint(ctx, BUTTER, INK, ink);

  ctx.strokeStyle = INK;
  ctx.lineWidth = r * 0.1;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(dir * r * 0.34, -r * 0.06, r * 0.19, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255,61,139,0.5)";
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(dir * r * 0.58, r * 0.24, r * 0.16, r * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.moveTo(-r * 0.09, r * 0.2);
  ctx.lineTo(r * 0.09, r * 0.2);
  ctx.lineTo(0, r * 0.31);
  ctx.closePath();
  paint(ctx, PINK, null);

  ctx.strokeStyle = INK;
  ctx.lineWidth = r * 0.07;
  for (const dir of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const y = r * (0.12 + i * 0.14);
      ctx.beginPath();
      ctx.moveTo(dir * r * 0.44, y);
      ctx.lineTo(dir * r * 1.22, y + r * (i - 1) * 0.1);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/* -------------------------------------------------------------------------- */
/* funny                                                                       */
/* -------------------------------------------------------------------------- */

function drawMata(ctx: CanvasRenderingContext2D, layout: LayoutPreset): void {
  const { w, h } = layout.canvas;
  const u = w / 900;

  // A paper band, then two ink rules: the frame looks hand-ruled rather than
  // printed, which is what makes the stuck-on eyes feel at home.
  ring(ctx, w, h, 20 * u, CREAM);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5 * u;
  ctx.strokeRect(2.5 * u, 2.5 * u, w - 5 * u, h - 5 * u);
  ctx.lineWidth = 2.5 * u;
  ctx.strokeRect(20.5 * u, 20.5 * u, w - 41 * u, h - 41 * u);

  const eyes: Array<{ x: number; y: number; r: number; look: [number, number] }> = [
    { x: 0.12 * w, y: 27 * u, r: 26 * u, look: [-0.35, 0.25] },
    { x: 0.28 * w, y: 16 * u, r: 14 * u, look: [0.3, 0.2] },
    { x: 0.46 * w, y: 31 * u, r: 22 * u, look: [0.15, -0.3] },
    { x: 0.62 * w, y: 14 * u, r: 12 * u, look: [-0.4, -0.1] },
    { x: 0.8 * w, y: 28 * u, r: 24 * u, look: [0.25, 0.35] },
    { x: 0.94 * w, y: 17 * u, r: 13 * u, look: [-0.2, 0.3] },
    { x: 24 * u, y: 0.36 * h, r: 18 * u, look: [0.35, -0.2] },
    { x: w - 24 * u, y: 0.61 * h, r: 20 * u, look: [-0.3, 0.25] },
  ];

  for (const eye of eyes) {
    ctx.beginPath();
    ctx.arc(eye.x, eye.y, eye.r, 0, Math.PI * 2);
    paint(ctx, PAPER, INK, Math.max(2.5, eye.r * 0.16));

    const px = eye.x + eye.look[0] * eye.r * 0.52;
    const py = eye.y + eye.look[1] * eye.r * 0.52;
    ctx.beginPath();
    ctx.arc(px, py, eye.r * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(px - eye.r * 0.12, py - eye.r * 0.15, eye.r * 0.11, 0, Math.PI * 2);
    ctx.fillStyle = PAPER;
    ctx.fill();
  }
}

function drawSpidol(ctx: CanvasRenderingContext2D, layout: LayoutPreset): void {
  const { w, h } = layout.canvas;
  const u = w / 900;

  // One marker box, drawn a little past each corner so it closes, then a
  // lighter second pass as if the marker went round twice.
  markerLine(ctx, 22 * u, 34 * u, w - 22 * u, 30 * u, 4 * u, INK, 1.5, 0.4);
  markerLine(ctx, w - 26 * u, 26 * u, w - 30 * u, h - 26 * u, 4 * u, INK, 1.5, 1.9);
  markerLine(ctx, w - 26 * u, h - 30 * u, 22 * u, h - 26 * u, 4 * u, INK, 1.5, 3.1);
  markerLine(ctx, 26 * u, h - 26 * u, 30 * u, 26 * u, 4 * u, INK, 1.5, 4.4);

  markerLine(ctx, 38 * u, 44 * u, w - 34 * u, 40 * u, 1.6 * u, PLUM, 1.2, 0.9);
  markerLine(ctx, w - 36 * u, 38 * u, w - 40 * u, h - 36 * u, 1.6 * u, PLUM, 1.2, 2.2);
  markerLine(ctx, w - 36 * u, h - 40 * u, 34 * u, h - 36 * u, 1.6 * u, PLUM, 1.2, 3.6);
  markerLine(ctx, 36 * u, h - 36 * u, 40 * u, 38 * u, 1.6 * u, PLUM, 1.2, 5.1);

  drawStarBurst(ctx, 0.11 * w, 92 * u, 42 * u, BUTTER);

  markerLine(ctx, w - 232 * u, 92 * u, w - 118 * u, 56 * u, 5 * u, PINK, 2, 0.2);
  markerLine(ctx, w - 118 * u, 56 * u, w - 146 * u, 40 * u, 5 * u, PINK, 1, 0);
  markerLine(ctx, w - 118 * u, 56 * u, w - 150 * u, 84 * u, 5 * u, PINK, 1, 0);

  for (let i = 0; i < 2; i++) {
    const x = 0.32 * w + i * 28 * u;
    rrPath(ctx, x, 40 * u, 7 * u, 30 * u, 3.5 * u);
    paint(ctx, ORANGE, null);
    ctx.beginPath();
    ctx.arc(x + 3.5 * u, 79 * u, 4 * u, 0, Math.PI * 2);
    ctx.fillStyle = ORANGE;
    ctx.fill();
  }

  // A wavy underline, the way you'd double-underline a shouted note.
  markerLine(ctx, 0.28 * w, 98 * u, 0.4 * w, 96 * u, 2.5 * u, ORANGE, 5, 0.6);

  for (let i = 0; i < 3; i++) {
    markerLine(
      ctx,
      42 * u,
      (0.42 + i * 0.035) * h,
      (42 + 56 - i * 8) * u,
      (0.42 + i * 0.035) * h,
      4 * u,
      MINT,
      1.4,
      i,
    );
  }
}

function drawStarBurst(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  fill: string,
): void {
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.44;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  paint(ctx, fill, INK, 3.5 * (r / 42));
}

/* -------------------------------------------------------------------------- */
/* horror                                                                      */
/* -------------------------------------------------------------------------- */

function drawHantu(ctx: CanvasRenderingContext2D, layout: LayoutPreset): void {
  const { w, h } = layout.canvas;
  const u = w / 900;
  const band = 28 * u;

  ring(ctx, w, h, band, INK);
  innerRule(ctx, w, h, band, 2.5 * u, PLUM);

  drawSlime(ctx, w, u);
  drawGhost(ctx, w - 124 * u, 136 * u, 58 * u);
}

function drawSlime(ctx: CanvasRenderingContext2D, w: number, u: number): void {
  const top = 34 * u;
  const width = 24 * u;
  const drips: Array<{ at: number; length: number }> = [
    { at: 0.09, length: 38 },
    { at: 0.22, length: 82 },
    { at: 0.38, length: 30 },
    { at: 0.53, length: 96 },
    { at: 0.69, length: 46 },
    { at: 0.84, length: 70 },
    { at: 0.96, length: 28 },
  ];

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, top);
  for (const drip of drips) {
    const cx = drip.at * w;
    const bottom = top + drip.length * u;
    ctx.rect(cx - width / 2, 0, width, bottom);
    ctx.arc(cx, bottom, width / 2, 0, Math.PI * 2);
  }
  // Stroke the silhouette thick, then fill over it: only the outside half of
  // the stroke survives, so overlapping drips read as one pour, not seams.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 10 * u;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.fillStyle = MINT;
  ctx.fill();
  ctx.restore();
}

function drawGhost(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
): void {
  const ink = r * 0.1;
  ctx.save();
  ctx.translate(cx, cy);

  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI, 0);
  ctx.lineTo(r, r * 0.55);
  const waves = 3;
  for (let i = 0; i < waves; i++) {
    const x1 = r - ((i + 1) * 2 * r) / waves;
    const xm = r - ((i + 0.5) * 2 * r) / waves;
    ctx.quadraticCurveTo(xm, r * 1.08, x1, r * 0.55);
  }
  ctx.lineTo(-r, 0);
  ctx.closePath();
  paint(ctx, PAPER, INK, ink);

  ctx.fillStyle = INK;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(dir * r * 0.31, -r * 0.08, r * 0.09, r * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(0, r * 0.2, r * 0.09, r * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(61,217,160,0.55)";
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(dir * r * 0.5, r * 0.16, r * 0.13, r * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // A wisp of glow under the ghost.
  ctx.beginPath();
  ctx.ellipse(0, r * 0.82, r * 0.45, r * 0.12, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(61,217,160,0.25)";
  ctx.fill();
  ctx.restore();
}

/* -------------------------------------------------------------------------- */
/* cool                                                                        */
/* -------------------------------------------------------------------------- */

function drawNeon(ctx: CanvasRenderingContext2D, layout: LayoutPreset): void {
  const { w, h } = layout.canvas;
  const u = w / 900;
  const band = 30 * u;

  ring(ctx, w, h, band, INK);

  ctx.save();
  ctx.strokeStyle = MINT;
  ctx.lineWidth = 4.5 * u;
  ctx.shadowColor = "rgba(61,217,160,0.55)";
  ctx.shadowBlur = 12 * u;
  ctx.strokeRect(10 * u, 10 * u, w - 20 * u, h - 20 * u);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 2.5 * u;
  ctx.shadowColor = "rgba(255,61,139,0.5)";
  ctx.shadowBlur = 8 * u;
  ctx.strokeRect(21 * u, 21 * u, w - 42 * u, h - 42 * u);
  ctx.restore();

  bolt(ctx, 66 * u, 94 * u, 50 * u, -0.35, BUTTER, 14 * u);
  bolt(ctx, w - 88 * u, 138 * u, 32 * u, 2.65, MINT, 10 * u);

  sparkle(ctx, 0.32 * w, 42 * u, 16 * u, PAPER, 6 * u);
  sparkle(ctx, w - 0.24 * w, 34 * u, 11 * u, BUTTER, 6 * u);
  sparkle(ctx, 40 * u, 0.42 * h, 13 * u, SKY, 6 * u);
  sparkle(ctx, w - 40 * u, 0.72 * h, 11 * u, PAPER, 6 * u);
}

/* -------------------------------------------------------------------------- */
/* race                                                                        */
/* -------------------------------------------------------------------------- */

function drawBalap(ctx: CanvasRenderingContext2D, layout: LayoutPreset): void {
  const { w, h } = layout.canvas;
  const u = w / 900;
  const square = 26 * u;
  const top = square * 2;
  const bottom = 20 * u;
  const curb = 18 * u;

  ctx.save();
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col * square < w; col++) {
      if ((row + col) % 2 === 0) {
        ctx.fillStyle = INK;
        ctx.fillRect(col * square, row * square, square, square);
      }
    }
  }
  for (let col = 0; col * square < w; col++) {
    if (col % 2 === 0) {
      ctx.fillStyle = INK;
      ctx.fillRect(col * square, h - bottom, square, bottom);
    }
  }

  // Curbs: alternating blocks down both edges, like a track.
  const from = top;
  const to = h - bottom;
  const block = square * 1.1;
  ctx.fillStyle = INK;
  ctx.fillRect(0, from, curb, to - from);
  ctx.fillRect(w - curb, from, curb, to - from);
  for (let y = from, i = 0; y < to; y += block, i++) {
    if (i % 2 === 0) {
      const height = Math.min(block, to - y);
      ctx.fillStyle = PINK;
      ctx.fillRect(0, y, curb, height);
      ctx.fillRect(w - curb, y, curb, height);
    }
  }

  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5 * u;
  ctx.beginPath();
  ctx.moveTo(0, top);
  ctx.lineTo(w, top);
  ctx.moveTo(0, h - bottom);
  ctx.lineTo(w, h - bottom);
  ctx.moveTo(curb, top);
  ctx.lineTo(curb, h - bottom);
  ctx.moveTo(w - curb, top);
  ctx.lineTo(w - curb, h - bottom);
  ctx.stroke();
  ctx.restore();

  // Race number badge.
  const bx = w - 94 * u;
  const by = top + 22 * u;
  const br = 46 * u;
  ctx.beginPath();
  ctx.arc(bx + 4 * u, by + 4 * u, br, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(36,20,40,0.32)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  paint(ctx, PAPER, INK, 5 * u);
  ctx.save();
  ctx.fillStyle = INK;
  ctx.font = `800 ${Math.round(40 * u)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("01", bx, by + 2 * u);
  ctx.restore();
}

/* -------------------------------------------------------------------------- */
/* admin-managed bitmap frames                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A frame row from Neon as returned by `GET /api/frames` and the admin API.
 * The artwork itself is served by Cloudinary (or the local fallback).
 */
export type DynamicFrameRecord = {
  id: string;
  name: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  windows: Rect[];
  layoutType: LayoutType;
  category: FrameCategory;
};

function bitmapPhotoSlots(frame: FramePreset, layout: LayoutPreset): Rect[] {
  const bitmap = frame.bitmap;
  // An upload without detected windows still works as a regular overlay: the
  // layout's own photo slots sit underneath it.
  if (!bitmap || bitmap.windows.length === 0) return layout.slots;
  if (bitmap.design.w <= 0 || bitmap.design.h <= 0) return layout.slots;

  const sx = layout.canvas.w / bitmap.design.w;
  const sy = layout.canvas.h / bitmap.design.h;
  return bitmap.windows.map((window) => ({
    x: window.x * sx,
    y: window.y * sy,
    w: window.w * sx,
    h: window.h * sy,
  }));
}

/** Turns a Neon frame row into the same shape the renderer uses for built-ins. */
export function dynamicFramePreset(row: DynamicFrameRecord): FramePreset {
  // Admin uploads are print-resolution PNGs. The canvas only ever needs enough
  // pixels for the largest export, and the picker only needs a small swatch, so
  // ask Cloudinary for bounded WebP/AVIF copies instead of shipping the
  // multi-megabyte original to every studio visitor.
  const src = cloudinaryImageUrl(row.imageUrl, "c_limit,f_auto,q_auto,w_1200");
  const swatchSrc = cloudinaryImageUrl(
    row.imageUrl,
    "c_limit,f_auto,q_auto,w_360",
  );
  const design = {
    w: row.imageWidth > 0 ? row.imageWidth : 900,
    h: row.imageHeight > 0 ? row.imageHeight : 1800,
  };
  const windows = Array.isArray(row.windows)
    ? row.windows.filter(
        (window) =>
          Number.isFinite(window.x) &&
          Number.isFinite(window.y) &&
          Number.isFinite(window.w) &&
          Number.isFinite(window.h) &&
          window.w > 0 &&
          window.h > 0,
      )
    : [];

  return {
    key: `db:${row.id}`,
    name: row.name,
    category: row.category,
    blurb: `Frame ${row.name} dari dashboard admin.`,
    layouts: [row.layoutType],
    bitmap: { src, swatchSrc, design, windows },
    draw: (ctx, layout) => {
      const image = getFrameImage(src);
      if (!image) return;
      // The artwork is stretched to the chosen layout canvas; its transparent
      // windows are mapped with the same scale so the photos stay aligned.
      ctx.drawImage(image, 0, 0, layout.canvas.w, layout.canvas.h);
    },
  };
}

export function frameSupportsLayout(
  frame: FramePreset,
  layoutType: LayoutType,
): boolean {
  return !frame.layouts || frame.layouts.includes(layoutType);
}

/** Photo rects for a frame. Bitmap frames define their own window grid. */
export function framePhotoSlots(
  frame: FramePreset,
  layout: LayoutPreset,
): Rect[] {
  return frame.bitmap ? bitmapPhotoSlots(frame, layout) : layout.slots;
}

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

export const FRAMES: Record<BuiltInFrameKey, FramePreset> = {
  pita: {
    key: "pita",
    name: "Pita",
    category: "cute",
    blurb: "Pita besar di atas bingkai bintik pink.",
    draw: drawPita,
  },
  kucing: {
    key: "kucing",
    name: "Kucing",
    category: "cute",
    blurb: "Kucing ngintip dari pojok, bingkai penuh tapak kaki.",
    draw: drawKucing,
  },
  mata: {
    key: "mata",
    name: "Mata",
    category: "funny",
    blurb: "Mata googly nempel di pinggir foto.",
    draw: drawMata,
  },
  spidol: {
    key: "spidol",
    name: "Spidol",
    category: "funny",
    blurb: "Bingkai dicoret-coret kayak buku sekolah.",
    draw: drawSpidol,
  },
  hantu: {
    key: "hantu",
    name: "Hantu",
    category: "horror",
    blurb: "Lendir dan hantu kecil. Lucu, bukan serem.",
    draw: drawHantu,
  },
  neon: {
    key: "neon",
    name: "Neon",
    category: "cool",
    blurb: "Garis neon nyala di bingkai hitam.",
    draw: drawNeon,
  },
  balap: {
    key: "balap",
    name: "Balap",
    category: "race",
    blurb: "Bendera catur, garis lintasan, dan nomor 01.",
    draw: drawBalap,
  },
};

export const FRAME_KEYS = Object.keys(FRAMES) as BuiltInFrameKey[];

export function builtInFrames(): FramePreset[] {
  return FRAME_KEYS.map((key) => FRAMES[key]);
}

export function isFrameCategory(value: unknown): value is FrameCategory {
  return (
    typeof value === "string" &&
    (FRAME_CATEGORIES as readonly string[]).includes(value)
  );
}

/** Filter a combined built-in + database frame list for the picker. */
export function filterFrames(
  frames: FramePreset[],
  category: FrameCategory | "all",
  layoutType?: LayoutType,
): FramePreset[] {
  return frames.filter(
    (frame) =>
      (category === "all" || frame.category === category) &&
      (!layoutType || frameSupportsLayout(frame, layoutType)),
  );
}

/* -------------------------------------------------------------------------- */
/* picker swatch                                                               */
/* -------------------------------------------------------------------------- */

/** A square stand-in layout so a swatch shows the whole top edge of a frame. */
const SWATCH_LAYOUT: LayoutPreset = {
  type: "SINGLE",
  label: "Swatch",
  blurb: "",
  shotCount: 1,
  canvas: { w: 900, h: 900 },
  slots: [{ x: 48, y: 48, w: 804, h: 804 }],
};

/** Fill a square with the top edge of the artwork, without distorting it. */
function drawCoverTop(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (image.naturalWidth === 0 || image.naturalHeight === 0) return;

  const targetRatio = w / h;
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  let sx = 0;
  let sy = 0;
  let sw = image.naturalWidth;
  let sh = image.naturalHeight;

  if (sourceRatio > targetRatio) {
    sw = image.naturalHeight * targetRatio;
    sx = (image.naturalWidth - sw) / 2;
  } else {
    sh = image.naturalWidth / targetRatio;
    sy = 0;
  }

  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
}

export function drawFrameSwatch(
  ctx: CanvasRenderingContext2D,
  size: number,
  frame: FramePreset | null,
): void {
  const scale = size / SWATCH_LAYOUT.canvas.w;
  ctx.save();
  ctx.scale(scale, scale);

  ctx.fillStyle = frame?.paperColor ?? PAPER;
  ctx.fillRect(0, 0, 900, 900);

  const slot = SWATCH_LAYOUT.slots[0];
  const gradient = ctx.createLinearGradient(slot.x, slot.y, slot.x + slot.w, slot.y + slot.h);
  gradient.addColorStop(0, "#9fd9ff");
  gradient.addColorStop(0.55, "#ffe3c2");
  gradient.addColorStop(1, "#ffd7e4");
  ctx.fillStyle = gradient;
  ctx.fillRect(slot.x, slot.y, slot.w, slot.h);

  ctx.fillStyle = "rgba(36,20,40,0.26)";
  ctx.beginPath();
  ctx.arc(450, 392, 92, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(450, 620, 185, 160, 0, Math.PI, Math.PI * 2);
  ctx.fill();

  if (frame?.bitmap) {
    // Show the top of the artwork. The photo windows reveal the gradient and
    // silhouette painted above, so the card reads like a miniature frame.
    const image = getFrameImage(frame.bitmap.swatchSrc);
    if (image) drawCoverTop(ctx, image, 0, 0, 900, 900);
  } else if (frame) {
    frame.draw(ctx, SWATCH_LAYOUT);
  }

  ctx.strokeStyle = "rgba(36,20,40,0.28)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 898, 898);
  ctx.restore();
}
