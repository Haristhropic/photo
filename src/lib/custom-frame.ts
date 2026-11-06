import {
  frameBand,
  roundedRectPath,
  type FramePreset,
} from "./frames";
import { PAPER_MARGIN, PRINT_RADIUS, type LayoutPreset } from "./layouts";
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

/** A thin rule that follows the photo's window instead of a square frame. */
function windowRule(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  inset: number,
  lineWidth: number,
  color: string,
): void {
  const x = inset + lineWidth / 2;
  // Parallel to the print's cut: the rule's radius shrinks by its inset, so the
  // pair stays concentric instead of drifting apart.
  const radius = Math.max(
    0,
    Math.min(PRINT_RADIUS - x, (w - x * 2) / 2, (h - x * 2) / 2),
  );
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  roundedRectPath(ctx, x, x, w - x * 2, h - x * 2, radius);
  ctx.stroke();
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
  const size = Math.max(12, Math.min(16, Math.round(w / 66)));
  const maxWidth = w - 2 * (PAPER_MARGIN + 18);
  const fitted = fitCaption(ctx, text, maxWidth, size, family);

  ctx.save();
  ctx.font = `800 ${fitted.size}px ${family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // The margin is only one frame band wide now, and a ring frame paints it, so
  // the caption gets a paper plate instead of fighting the accent colour. It
  // reads as a printed label on the border — the same stuck-on language as the
  // sticker, without covering a face.
  const cy = PAPER_MARGIN / 2 + 1;
  const plateH = Math.min(PAPER_MARGIN - 6, fitted.size + 6);
  const plateW = Math.min(
    w - 2 * (PAPER_MARGIN + 10),
    ctx.measureText(fitted.text).width + 22,
  );
  ctx.fillStyle = options.paper;
  roundedRectPath(
    ctx,
    (w - plateW) / 2,
    cy - plateH / 2,
    plateW,
    plateH,
    plateH / 2,
  );
  ctx.fill();

  ctx.fillStyle = INK;
  ctx.fillText(fitted.text, w / 2, cy);
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
        const thickness = Math.max(16 * u, PAPER_MARGIN);
        frameBand(ctx, w, h, thickness, options.accent);
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
        // Two rules, both tracing the photo's window: a square pair would cut
        // across the photo's rounded corners.
        windowRule(ctx, w, h, 8 * u, 4 * u, options.accent);
        windowRule(ctx, w, h, PAPER_MARGIN, 2.5 * u, INK);
      } else {
        frameBand(ctx, w, h, Math.max(14 * u, PAPER_MARGIN), options.accent);
      }

      drawCaption(ctx, layout, options);
    },
  };
}
