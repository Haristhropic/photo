"use client";

import { useEffect, useRef } from "react";

import {
  drawFrameSwatch,
  preloadFrameImage,
  type FramePreset,
} from "@/lib/frames";

const SIZE = 180;

/**
 * A square swatch for the studio picker. Vector frames paint from the same
 * draw functions as the export; admin-managed bitmap frames use their
 * Cloudinary artwork and reveal the painted silhouette through the windows.
 */
export function FrameSwatch({ frame }: { frame: FramePreset | null }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    const paint = () => {
      if (!cancelled) drawFrameSwatch(ctx, SIZE, frame);
    };

    paint();
    // Bitmap frames show a blank card until their artwork decodes; repaint
    // once it is available. The full artwork is only loaded when selected.
    if (frame?.bitmap) {
      preloadFrameImage(frame.bitmap.swatchSrc)
        .then(paint)
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [frame]);

  return (
    <canvas
      ref={ref}
      width={SIZE}
      height={SIZE}
      aria-hidden="true"
      className="aspect-square w-full rounded-[8px] border-2 border-ink bg-elev"
    />
  );
}
