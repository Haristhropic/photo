"use client";

import { useEffect, useRef } from "react";

import {
  drawStickerSwatch,
  STICKERS,
  type StickerKey,
} from "@/lib/stickers";

const SIZE = 180;

/**
 * A sticker swatch painted from the same artwork as the export. It redraws once
 * the display face is ready so the picker never shows fallback lettering.
 */
export function StickerSwatch({ stickerKey }: { stickerKey: StickerKey | null }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const paint = () => {
      if (cancelled) return;
      drawStickerSwatch(
        ctx,
        SIZE,
        stickerKey ? STICKERS[stickerKey] : null,
      );
    };

    paint();
    void document.fonts.ready
      .then(() => {
        if (!cancelled) paint();
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [stickerKey]);

  return (
    <canvas
      ref={ref}
      width={SIZE}
      height={SIZE}
      aria-hidden="true"
      className="block aspect-square w-full rounded-[7px]"
    />
  );
}
