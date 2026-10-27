"use client";

import { useEffect, useRef, useState } from "react";

import { drawPhotoCover, type ShotTransform } from "@/lib/photo-transform";

const THUMB_WIDTH = 420;

/**
 * A small, accurate preview of a photo inside its slot. The booth uses the
 * same crop maths as the export, so reordering or repositioning a photo gives
 * immediate feedback instead of an approximately CSS-cropped thumbnail.
 */
export function PhotoThumb({
  src,
  aspect,
  transform,
  className,
}: {
  src: string;
  aspect: number;
  transform: ShotTransform;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  // Bumping this after every decode forces the draw effect to run for a
  // replaced image. A boolean "loaded" flag can collapse false -> true in one
  // React batch on a fast data-URL decode, leaving the old pixels on screen.
  const [imageVersion, setImageVersion] = useState(0);

  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const height = Math.max(1, Math.round(THUMB_WIDTH / safeAspect));

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.src = src;
    const ready =
      typeof image.decode === "function"
        ? image.decode()
        : new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error("decode failed"));
          });

    ready
      .then(() => {
        if (cancelled) return;
        imageRef.current = image;
        setImageVersion((version) => version + 1);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      imageRef.current = null;
    };
  }, [src]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPhotoCover(
      ctx,
      image,
      { x: 0, y: 0, w: canvas.width, h: canvas.height },
      transform,
    );
  }, [imageVersion, transform]);

  return (
    <canvas
      ref={canvasRef}
      width={THUMB_WIDTH}
      height={height}
      aria-hidden="true"
      className={className}
      style={{ aspectRatio: `${safeAspect}` }}
    />
  );
}
