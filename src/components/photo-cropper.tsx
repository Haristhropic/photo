"use client";

import { IconCheck, IconRefresh, IconX } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

import {
  MAX_SHOT_ZOOM,
  MIN_SHOT_ZOOM,
  drawPhotoCover,
  normalizeShotTransform,
  photoCoverCrop,
  type ShotTransform,
} from "@/lib/photo-transform";

const PREVIEW_WIDTH = 640;

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  focusX: number;
  focusY: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Focus/zoom editor for an uploaded shot.
 *
 * The preview canvas calls the same `drawPhotoCover` as `renderStrip`, so what
 * the guest lines up here is exactly what lands in the exported PNG. Pointer
 * movement is converted through the visible source crop, which keeps the drag
 * speed natural whether the image is portrait, landscape, or zoomed in.
 */
export function PhotoCropper({
  src,
  aspect,
  title,
  value,
  onCancel,
  onSave,
}: {
  src: string;
  aspect: number;
  title: string;
  value: ShotTransform;
  onCancel: () => void;
  onSave: (value: ShotTransform) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const previewHeight = Math.max(1, Math.round(PREVIEW_WIDTH / safeAspect));

  const [loaded, setLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [focusX, setFocusX] = useState(value.focusX);
  const [focusY, setFocusY] = useState(value.focusY);
  const [zoom, setZoom] = useState(value.zoom);

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
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setImageError(true);
      });

    return () => {
      cancelled = true;
      imageRef.current = null;
    };
  }, [src]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !loaded) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f4efe5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawPhotoCover(
      ctx,
      image,
      { x: 0, y: 0, w: canvas.width, h: canvas.height },
      { focusX, focusY, zoom },
    );
  }, [loaded, focusX, focusY, zoom]);

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      focusX,
      focusY,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !canvas || !image) return;

    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const scaleX = canvas.width / bounds.width;
    const scaleY = canvas.height / bounds.height;
    const dx = (event.clientX - drag.startX) * scaleX;
    const dy = (event.clientY - drag.startY) * scaleY;

    const crop = photoCoverCrop(
      image.naturalWidth,
      image.naturalHeight,
      canvas.width / canvas.height,
      { focusX: drag.focusX, focusY: drag.focusY, zoom },
    );
    if (crop.w <= 0 || crop.h <= 0) return;

    const nextX =
      drag.focusX -
      (dx * crop.w) / (canvas.width * image.naturalWidth);
    const nextY =
      drag.focusY -
      (dy * crop.h) / (canvas.height * image.naturalHeight);

    setFocusX(clamp(nextX, 0, 1));
    setFocusY(clamp(nextY, 0, 1));
  }

  function endDrag(event: React.PointerEvent<HTMLCanvasElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function reset() {
    setFocusX(0.5);
    setFocusY(0.5);
    setZoom(1);
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-ink/60 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cropper-title"
        data-testid="photo-cropper"
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-[var(--radius-xl)] border-2 border-ink bg-elev p-4 shadow-lift-3 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="cropper-title" className="font-display text-h2 font-extrabold text-ink">
              {title}
            </h2>
            <p className="mt-1 text-small text-ink-body">
              Geser foto untuk atur posisi. Zoom kalau perlu.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onCancel}
            aria-label="Tutup pengaturan foto"
            className="pressable grid size-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-elev text-ink shadow-lift-1 hover:bg-butter"
          >
            <IconX size={20} stroke={2.5} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-[var(--radius)] border-2 border-ink bg-sunken">
          <canvas
            ref={canvasRef}
            width={PREVIEW_WIDTH}
            height={previewHeight}
            data-testid="crop-canvas"
            className="block h-auto w-full cursor-grab touch-none active:cursor-grabbing"
            style={{ touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        </div>
        {imageError && (
          <p role="alert" className="mt-3 rounded-[var(--radius)] border-2 border-ink bg-pink px-3 py-2 text-small font-semibold text-ink">
            Foto ini tidak bisa dibuka untuk diatur. Coba ganti fotonya.
          </p>
        )}

        <div className="mt-4">
          <label
            htmlFor="crop-zoom"
            className="flex items-center justify-between gap-3 font-display text-label font-extrabold tracking-[0.1em] text-ink uppercase"
          >
            Zoom
            <span className="text-ink-meta">{zoom.toFixed(1)}x</span>
          </label>
          <input
            id="crop-zoom"
            type="range"
            min={MIN_SHOT_ZOOM}
            max={MAX_SHOT_ZOOM}
            step={0.05}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="mt-2 w-full accent-[var(--pink)]"
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() =>
              onSave(normalizeShotTransform({ focusX, focusY, zoom }))
            }
            disabled={!loaded || imageError}
            className="pressable inline-flex flex-1 items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-pink px-6 py-3 font-display text-body font-extrabold text-ink shadow-lift-1 hover:bg-[var(--mix-coral)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <IconCheck size={20} stroke={2.5} aria-hidden="true" />
            Simpan posisi
          </button>
          <button
            type="button"
            onClick={reset}
            className="pressable inline-flex items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-elev px-5 py-3 font-display text-body font-bold text-ink shadow-lift-1 hover:bg-butter"
          >
            <IconRefresh size={20} stroke={2.5} aria-hidden="true" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
