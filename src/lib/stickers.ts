import type { LayoutPreset } from "./layouts";

/**
 * Die-cut sticker pack.
 *
 * Every sticker is painted with canvas primitives in one local 360×220 box:
 * a paper rim, an ink keyline, a hard offset shadow and artwork inside. The
 * same paint function drives the picker swatch and the exported PNG, so a
 * sticker cannot look one way in the studio and another on the saved strip.
 *
 * Placement: the pack is slapped on the bottom-left corner, partly over the
 * last photo and partly over the paper margin, always clear of the faces.
 * Bitmap event frames can pass a lower edge so the sticker stays above their
 * branded footer instead of covering the event art.
 */

const INK = "#241428";
const PAPER = "#fffdf8";
const PINK = "#ff3d8b";
const BUTTER = "#ffd23f";
const MINT = "#3dd9a0";
const SKY = "#3da5f5";
const ORANGE = "#ff7a1a";

const HALF_W = 193;
const HALF_H = 123;

type PathFn = (ctx: CanvasRenderingContext2D) => void;

/* -------------------------------------------------------------------------- */
/* primitives                                                                  */
/* -------------------------------------------------------------------------- */

function dieCut(
  ctx: CanvasRenderingContext2D,
  path: PathFn,
  fill: string,
): void {
  // Hard offset shadow, same language as the app's sticker elevation.
  ctx.save();
  ctx.translate(8, 10);
  ctx.beginPath();
  path(ctx);
  ctx.fillStyle = "rgba(36,20,40,0.26)";
  ctx.fill();
  ctx.restore();

  // Paper rim: a fat stroke plus a fill leaves a clean die-cut margin.
  ctx.save();
  ctx.beginPath();
  path(ctx);
  ctx.lineJoin = "round";
  ctx.lineWidth = 26;
  ctx.strokeStyle = PAPER;
  ctx.stroke();
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.restore();

  // Artwork fill and ink keyline.
  ctx.beginPath();
  path(ctx);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineJoin = "round";
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function clipped(
  ctx: CanvasRenderingContext2D,
  path: PathFn,
  body: () => void,
): void {
  ctx.save();
  ctx.beginPath();
  path(ctx);
  ctx.clip();
  body();
  ctx.restore();
}

function displayFamily(): string {
  if (typeof document === "undefined") {
    return "ui-sans-serif, system-ui, sans-serif";
  }
  const el = document.querySelector(".font-display");
  if (!el) return "ui-sans-serif, system-ui, sans-serif";
  return getComputedStyle(el).fontFamily || "ui-sans-serif, system-ui, sans-serif";
}

function words(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  maxWidth: number,
  family: string,
  fill = INK,
): void {
  let fontSize = size;
  ctx.font = `800 ${fontSize}px ${family}`;
  const width = ctx.measureText(text).width;
  if (width > maxWidth) {
    fontSize = (fontSize * maxWidth) / width;
    ctx.font = `800 ${fontSize}px ${family}`;
  }
  ctx.fillStyle = fill;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

function microWords(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  tracking: number,
  family: string,
  fill = INK,
): void {
  ctx.font = `700 ${size}px ${family}`;
  const chars = [...text];
  const widths = chars.map((char) => ctx.measureText(char).width);
  const total =
    widths.reduce((sum, width) => sum + width, 0) + tracking * (chars.length - 1);
  let cursor = x - total / 2;
  ctx.fillStyle = fill;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  chars.forEach((char, i) => {
    ctx.fillText(char, cursor, y);
    cursor += widths[i] + tracking;
  });
}

function star(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  fill: string,
): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function sparkle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  fill: string,
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + r * 0.14, cy - r * 0.14, cx + r, cy);
  ctx.quadraticCurveTo(cx + r * 0.14, cy + r * 0.14, cx, cy + r);
  ctx.quadraticCurveTo(cx - r * 0.14, cy + r * 0.14, cx - r, cy);
  ctx.quadraticCurveTo(cx - r * 0.14, cy - r * 0.14, cx, cy - r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function heart(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  fill: string,
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy + r);
  ctx.bezierCurveTo(
    cx - r * 0.22,
    cy + r * 0.64,
    cx - r,
    cy - 0.04 * r,
    cx - r,
    cy - r * 0.46,
  );
  ctx.bezierCurveTo(
    cx - r,
    cy - r * 0.82,
    cx - r * 0.58,
    cy - r * 0.98,
    cx - r * 0.32,
    cy - r * 0.78,
  );
  ctx.bezierCurveTo(
    cx - r * 0.14,
    cy - r * 0.64,
    cx - 0.05 * r,
    cy - r * 0.5,
    cx,
    cy - r * 0.38,
  );
  ctx.bezierCurveTo(
    cx + 0.05 * r,
    cy - r * 0.5,
    cx + r * 0.14,
    cy - r * 0.64,
    cx + r * 0.32,
    cy - r * 0.78,
  );
  ctx.bezierCurveTo(
    cx + r * 0.58,
    cy - r * 0.98,
    cx + r,
    cy - r * 0.82,
    cx + r,
    cy - r * 0.46,
  );
  ctx.bezierCurveTo(
    cx + r,
    cy - 0.04 * r,
    cx + r * 0.22,
    cy + r * 0.64,
    cx,
    cy + r,
  );
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/* -------------------------------------------------------------------------- */
/* shapes                                                                      */
/* -------------------------------------------------------------------------- */

function bubblePath(ctx: CanvasRenderingContext2D): void {
  ctx.moveTo(-120, -80);
  ctx.lineTo(120, -80);
  ctx.quadraticCurveTo(150, -80, 150, -50);
  ctx.lineTo(150, 8);
  ctx.quadraticCurveTo(150, 38, 120, 38);
  ctx.lineTo(-42, 38);
  ctx.lineTo(-118, 96);
  ctx.lineTo(-96, 38);
  ctx.lineTo(-120, 38);
  ctx.quadraticCurveTo(-150, 38, -150, 8);
  ctx.lineTo(-150, -50);
  ctx.quadraticCurveTo(-150, -80, -120, -80);
  ctx.closePath();
}

function burstPath(ctx: CanvasRenderingContext2D): void {
  const spikes = 12;
  const outer = 104;
  const inner = 66;
  for (let i = 0; i < spikes * 2; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / spikes;
    const radius = i % 2 === 0 ? outer : inner;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function ribbonPath(ctx: CanvasRenderingContext2D): void {
  ctx.moveTo(-168, -46);
  ctx.lineTo(168, -46);
  ctx.lineTo(140, 0);
  ctx.lineTo(168, 46);
  ctx.lineTo(-168, 46);
  ctx.lineTo(-140, 0);
  ctx.closePath();
}

function heartPath(ctx: CanvasRenderingContext2D): void {
  ctx.moveTo(0, 90);
  ctx.bezierCurveTo(-22, 63, -105, 4, -105, -42);
  ctx.bezierCurveTo(-105, -82, -62, -96, -32, -77);
  ctx.bezierCurveTo(-14, -65, -5, -49, 0, -38);
  ctx.bezierCurveTo(5, -49, 14, -65, 32, -77);
  ctx.bezierCurveTo(62, -96, 105, -82, 105, -42);
  ctx.bezierCurveTo(105, 4, 22, 63, 0, 90);
  ctx.closePath();
}

function ticketPath(ctx: CanvasRenderingContext2D): void {
  const w = 158;
  const h = 74;
  const corner = 18;
  const notch = 20;

  ctx.moveTo(-w + corner, -h);
  ctx.lineTo(w - corner, -h);
  ctx.quadraticCurveTo(w, -h, w, -h + corner);
  ctx.lineTo(w, -notch);
  ctx.arc(w, 0, notch, -Math.PI / 2, Math.PI / 2, true);
  ctx.lineTo(w, h - corner);
  ctx.quadraticCurveTo(w, h, w - corner, h);
  ctx.lineTo(-w + corner, h);
  ctx.quadraticCurveTo(-w, h, -w, h - corner);
  ctx.lineTo(-w, notch);
  ctx.arc(-w, 0, notch, Math.PI / 2, -Math.PI / 2, true);
  ctx.lineTo(-w, -h + corner);
  ctx.quadraticCurveTo(-w, -h, -w + corner, -h);
  ctx.closePath();
}

function sealPath(ctx: CanvasRenderingContext2D): void {
  const bumps = 14;
  const base = 88;
  const peak = 108;
  for (let i = 0; i <= bumps; i += 1) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / bumps;
    const x = Math.cos(angle) * base;
    const y = Math.sin(angle) * base;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      const mid = -Math.PI / 2 + ((i - 0.5) * 2 * Math.PI) / bumps;
      ctx.quadraticCurveTo(
        Math.cos(mid) * peak,
        Math.sin(mid) * peak,
        x,
        y,
      );
    }
  }
  ctx.closePath();
}

/* -------------------------------------------------------------------------- */
/* artwork                                                                     */
/* -------------------------------------------------------------------------- */

function paintSenyum(ctx: CanvasRenderingContext2D, family: string): void {
  dieCut(ctx, bubblePath, PINK);

  clipped(ctx, bubblePath, () => {
    ctx.beginPath();
    ctx.arc(-86, -18, 32, 0, Math.PI * 2);
    ctx.fillStyle = BUTTER;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.stroke();

    // Winking left eye.
    ctx.beginPath();
    ctx.moveTo(-98, -27);
    ctx.quadraticCurveTo(-87, -14, -76, -27);
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = INK;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-70, -26, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-98, -4);
    ctx.quadraticCurveTo(-86, 10, -74, -4);
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
  });

  words(ctx, "SENYUM", 46, -2, 42, 166, family);
  sparkle(ctx, 126, -52, 10, INK);
}

function paintCakep(ctx: CanvasRenderingContext2D, family: string): void {
  dieCut(ctx, burstPath, BUTTER);
  star(ctx, 0, -54, 12, INK);
  words(ctx, "CAKEP", 0, 8, 40, 124, family);
  for (const x of [-20, 0, 20]) {
    ctx.beginPath();
    ctx.arc(x, 46, 3, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
  }
}

function paintSquad(ctx: CanvasRenderingContext2D, family: string): void {
  dieCut(ctx, ribbonPath, MINT);
  star(ctx, -126, -2, 10, INK);
  star(ctx, 126, -2, 10, INK);
  words(ctx, "SQUAD", 0, 2, 46, 196, family);
}

function paintBestie(ctx: CanvasRenderingContext2D, family: string): void {
  dieCut(ctx, heartPath, PINK);
  words(ctx, "BESTIE", 0, -12, 34, 136, family);
  sparkle(ctx, -58, -50, 12, PAPER);
  sparkle(ctx, 56, -34, 8, PAPER);
}

function paintParty(ctx: CanvasRenderingContext2D, family: string): void {
  dieCut(ctx, ticketPath, SKY);

  clipped(ctx, ticketPath, () => {
    ctx.save();
    ctx.setLineDash([9, 9]);
    ctx.beginPath();
    ctx.moveTo(-96, -54);
    ctx.lineTo(-96, 54);
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();

    star(ctx, -128, -30, 9, INK);
    words(ctx, "01", -128, 28, 16, 44, family);
  });

  words(ctx, "PARTY", 22, -6, 42, 146, family);
  microWords(ctx, "SNAPVIBE", 22, 44, 9, 2.6, family);
}

function paintGemes(ctx: CanvasRenderingContext2D, family: string): void {
  dieCut(ctx, sealPath, ORANGE);

  ctx.beginPath();
  ctx.arc(0, 0, 64, 0, Math.PI * 2);
  ctx.fillStyle = BUTTER;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();

  for (let i = 0; i < 12; i += 1) {
    const angle = (i * 2 * Math.PI) / 12;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * 78, Math.sin(angle) * 78, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(36,20,40,0.4)";
    ctx.fill();
  }

  heart(ctx, 0, -38, 8, PINK);
  words(ctx, "GEMES", 0, 4, 30, 106, family);
}

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

export const STICKER_KEYS = [
  "senyum",
  "cakep",
  "squad",
  "bestie",
  "party",
  "gemes",
] as const;

export type StickerKey = (typeof STICKER_KEYS)[number];

export type StickerPreset = {
  key: StickerKey;
  name: string;
  blurb: string;
  rotation: number;
  paint: (ctx: CanvasRenderingContext2D, family: string) => void;
};

export const STICKERS: Record<StickerKey, StickerPreset> = {
  senyum: {
    key: "senyum",
    name: "Senyum",
    blurb: "Balon kata plus muka ngejulur. Wajib senyum.",
    rotation: -7,
    paint: paintSenyum,
  },
  cakep: {
    key: "cakep",
    name: "Cakep",
    blurb: "Ledakan bintang buat yang paling photogenic.",
    rotation: 8,
    paint: paintCakep,
  },
  squad: {
    key: "squad",
    name: "Squad",
    blurb: "Pita buat geng yang foto bareng.",
    rotation: -5,
    paint: paintSquad,
  },
  bestie: {
    key: "bestie",
    name: "Bestie",
    blurb: "Hati pink buat sahabat sejati.",
    rotation: -8,
    paint: paintBestie,
  },
  party: {
    key: "party",
    name: "Party",
    blurb: "Tiket masuk ke momen ini.",
    rotation: 6,
    paint: paintParty,
  },
  gemes: {
    key: "gemes",
    name: "Gemes",
    blurb: "Segel lucu buat yang bikin gemes.",
    rotation: -9,
    paint: paintGemes,
  },
};

/** Where the sticker sits, in strip pixels, for any layout. */
export function drawSticker(
  ctx: CanvasRenderingContext2D,
  sticker: StickerPreset,
  layout: LayoutPreset,
  options: { photoWidth?: number; bottom?: number } = {},
): void {
  const { w, h } = layout.canvas;
  const slotWidth = options.photoWidth ?? layout.slots[0]?.w ?? w;
  // Size against the photo, not the canvas: a 2x2 photo is smaller than a strip.
  const scale = (slotWidth * 0.32) / 360;
  const radians = (sticker.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  // Rotated bounds of the die-cut rim, so the pack never clips the paper edge.
  const extentX = HALF_W * cos + HALF_H * sin;
  const extentY = HALF_W * sin + HALF_H * cos;
  const cx = 44 + extentX * scale;
  // Bitmap event frames can pass a lower edge above the canvas bottom so the
  // sticker lands on the last photo instead of over the frame's footer.
  const cy = (options.bottom ?? h) - 20 - extentY * scale;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(radians);
  ctx.scale(scale, scale);
  sticker.paint(ctx, displayFamily());
  ctx.restore();
}

/* -------------------------------------------------------------------------- */
/* picker swatch                                                               */
/* -------------------------------------------------------------------------- */

export function drawStickerSwatch(
  ctx: CanvasRenderingContext2D,
  size: number,
  sticker: StickerPreset | null,
): void {
  const box = 360;
  const scale = size / box;
  const family = displayFamily();
  ctx.save();
  ctx.scale(scale, scale);

  const gradient = ctx.createLinearGradient(0, 0, box, box);
  gradient.addColorStop(0, "#9fd9ff");
  gradient.addColorStop(0.55, "#ffe3c2");
  gradient.addColorStop(1, "#ffd7e4");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, box, box);

  // Halftone paper texture, faint enough to stay behind the sticker.
  ctx.fillStyle = "rgba(36,20,40,0.07)";
  for (let y = 14; y < box; y += 24) {
    const offset = (y / 24) % 2 < 1 ? 12 : 24;
    for (let x = offset; x < box; x += 24) {
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (sticker) {
    ctx.translate(box / 2, box / 2 + 4);
    ctx.rotate((sticker.rotation * Math.PI) / 180);
    ctx.scale(0.8, 0.8);
    sticker.paint(ctx, family);
  }

  ctx.strokeStyle = "rgba(36,20,40,0.3)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, box - 2, box - 2);
  ctx.restore();
}
