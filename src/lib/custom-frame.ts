import type { FramePreset } from "./frames";
import type { LayoutPreset } from "./layouts";
import { displayFamily } from "./stickers";

/**
 * The guest-built frame offered in the studio.
 *
 * It deliberately only paints the margins: the photo slots still come from the
 * layout, so a custom frame can never cover a face or change the strip's
 * geometry. The caption lives in the top margin, clear of the sticker in the
 * bottom-left and the event label in the bottom-right.
 */

export const CUSTOM_FRAME_STYLES = ["ring", "dots", "double"] as const;
export type CustomFrameStyle = (typeof CUSTOM_FRAME_STYLES)[number];

export const CUSTOM_FRAME_STYLE_LABEL: Record<CustomFrameStyle, string> = {
  ring: "Bingkai",
  dots: "Bintik",
  double: "Garis",
};

export const CUSTOM_PAPER_COLORS = [
  { value: "#fffdf8", label: "Putih" },
  { value: "#fdf3e3", label: "Krem" },
  { value: "#ffe3ef", label: "Blush" },
  { value: "#e7f8f0", label: "Mint" },
  { value: "#e6f3ff", label: "Langit" },
  { value: "#fff6d6", label: "Mentega" },
] as const;

export const CUSTOM_ACCENT_COLORS = [
  { value: "#ff3d8b", label: "Pink" },
  { value: "#ff7a1a", label: "Oranye" },
  { value: "#ffd23f", label: "Kuning" },
  { value: "#3dd9a0", label: "Mint" },
  { value: "#3da5f5", label: "Biru" },
  { value: "#7b2d8e", label: "Plum" },
] as const;

export const MAX_CUSTOM_CAPTION = 20;

export type CustomFrameOptions = {
  style: CustomFrameStyle;
  paper: string;
  accent: string;
  caption: string;
  showDate: boolean;
};

export const CUSTOM_FRAME_DEFAULTS: CustomFrameOptions = {
  style: "ring",
  paper: "#fffdf8",
  accent: "#ff3d8b",
  caption: "",
  showDate: false,
};

const INK = "#241428";

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

function formatDate(): string {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date());
  } catch {
    return "";
  }
}

function fitCaption(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  size: number,
  family: string,
): { text: string; size: number } {
  let fontSize = size;
  const value = text;
  ctx.font = `800 ${fontSize}px ${family}`;

  // Shrink first so short captions stay readable, then ellipsise only when the
  // caption is too long even at the smallest size the margin can hold.
  while (ctx.measureText(value).width > maxWidth && fontSize > 11) {
    fontSize -= 1;
    ctx.font = `800 ${fontSize}px ${family}`;
  }
  if (ctx.measureText(value).width <= maxWidth) {
    return { text: value, size: fontSize };
  }

  const chars = Array.from(value);
  while (
    chars.length > 1 &&
    ctx.measureText(`${chars.join("")}…`).width > maxWidth
  ) {
    chars.pop();
  }
  return { text: `${chars.join("")}…`, size: fontSize };
}

function drawCaption(ctx: CanvasRenderingContext2D, layout: LayoutPreset, options: CustomFrameOptions): void {
  const caption = options.caption.trim().toUpperCase();
  const date = options.showDate ? formatDate() : "";
  const text = [caption, date].filter(Boolean).join(" · ");
  if (!text) return;

  const { w } = layout.canvas;
  const family = displayFamily();
  const size = Math.max(13, Math.min(18, Math.round(w / 60)));
  const maxWidth = w - 120;
  const fitted = fitCaption(ctx, text, maxWidth, size, family);

  ctx.save();
  ctx.font = `800 ${fitted.size}px ${family}`;
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // The layouts reserve the outer 48px as paper margin. The caption sits in
  // that top strip, clear of the border and of the sticker/event label below.
  ctx.fillText(fitted.text, w / 2, 35);
  ctx.restore();
}

export function customFramePreset(options: CustomFrameOptions): FramePreset {
  return {
    key: "custom",
    name: "Custom",
    category: "cool",
    blurb: "Frame buatanmu: warna, gaya, dan tulisan sendiri.",
    paperColor: options.paper,
    draw: (ctx, layout) => {
      const { w, h } = layout.canvas;
      const u = w / 900;

      if (options.style === "dots") {
        const thickness = 16 * u;
        ring(ctx, w, h, thickness, options.accent);
        ctx.fillStyle = options.paper;
        const step = 30 * u;
        for (let y = thickness / 2; y < h; y += step) {
          for (let x = thickness / 2; x < w; x += step) {
            const onRing =
              x < thickness ||
              x > w - thickness ||
              y < thickness ||
              y > h - thickness;
            if (!onRing) continue;
            ctx.beginPath();
            ctx.arc(x, y, 4 * u, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (options.style === "double") {
        ctx.strokeStyle = options.accent;
        ctx.lineWidth = 4 * u;
        ctx.strokeRect(7 * u, 7 * u, w - 14 * u, h - 14 * u);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2.5 * u;
        ctx.strokeRect(16 * u, 16 * u, w - 32 * u, h - 32 * u);
      } else {
        ring(ctx, w, h, 14 * u, options.accent);
      }

      drawCaption(ctx, layout, options);
    },
  };
}
