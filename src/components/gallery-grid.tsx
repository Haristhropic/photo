"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type GalleryPhoto = {
  id: string;
  cloudinaryUrl: string;
  layoutType: string;
  filterKey: string;
  publishedAt: string | null;
};

const LAYOUT_LABELS: Record<string, string> = {
  STRIP_3: "Strip 3",
  STRIP_4: "Strip 4",
  GRID_4: "Grid 2x2",
  SINGLE: "Single",
};

function formatDate(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function GalleryGrid() {
  const [photos, setPhotos] = useState<GalleryPhoto[] | null>(null);
  const [failed, setFailed] = useState(false);
  // "Coba lagi" bumps this instead of calling a loader, because the React
  // Compiler lint rule rejects setState written directly in an effect body.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    const run = async () => {
      try {
        const response = await fetch("/api/gallery", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`status ${response.status}`);
        const data = (await response.json()) as { photos: GalleryPhoto[] };
        setPhotos(data.photos);
        setFailed(false);
      } catch {
        // A cleanup abort is not a failure the guest should see.
        if (controller.signal.aborted) return;
        setFailed(true);
      }
    };

    void run();
    return () => controller.abort();
  }, [attempt]);

  if (failed) {
    return (
      <div className="mt-10 rounded-[var(--radius)] border-2 border-ink bg-sunken p-6 text-center">
        <p className="text-lead text-ink-body">
          Galeri belum bisa dimuat sekarang.
        </p>
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setPhotos(null);
            setAttempt((n) => n + 1);
          }}
          className="pressable mt-4 inline-flex items-center rounded-[var(--radius-pill)] border-2 border-ink bg-elev px-5 py-2 font-display text-label font-bold tracking-[0.1em] text-ink uppercase shadow-lift-1"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  if (photos === null) {
    return (
      <p className="mt-10 text-lead text-ink-body">Memuat galeri...</p>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="mt-10 rounded-[var(--radius)] border-2 border-ink bg-sunken p-8 text-center">
        <p className="font-display text-lead font-extrabold text-ink">
          Belum ada foto publik
        </p>
        <p className="mx-auto mt-2 max-w-[var(--measure)] text-ink-body">
          Foto pertama muncul setelah ada tamu yang mencentang
          &quot;Tampilkan di galeri&quot; di studio.
        </p>
        <Link
          href="/booth?from=home"
          className="pressable mt-6 inline-flex items-center rounded-[var(--radius-pill)] border-2 border-ink bg-pink px-6 py-3 font-display text-label font-extrabold tracking-[0.1em] text-ink uppercase shadow-lift-2"
        >
          Jepret yang pertama
        </Link>
      </div>
    );
  }

  return (
    <>
      <ul className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo, index) => (
          <li
            key={photo.id}
            className="overflow-hidden rounded-[var(--radius)] border-2 border-ink bg-elev shadow-lift-2"
            style={{
              transform: `rotate(${index % 2 === 0 ? -0.7 : 0.7}deg)`,
            }}
          >
            <img
              src={photo.cloudinaryUrl}
              alt={`Strip foto ${LAYOUT_LABELS[photo.layoutType] ?? photo.layoutType}`}
              loading="lazy"
              className="aspect-3/4 w-full bg-sunken object-cover"
            />
            <div className="flex items-center justify-between gap-2 border-t-2 border-ink bg-paper px-3 py-2">
              <span className="truncate font-display text-label font-bold tracking-[0.08em] text-ink uppercase">
                {LAYOUT_LABELS[photo.layoutType] ?? photo.layoutType}
              </span>
              <span className="shrink-0 font-display text-small font-bold tracking-[0.08em] text-ink-meta uppercase">
                {formatDate(photo.publishedAt)}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-small text-ink-meta">
        {photos.length} foto publik. Foto tanpa centang tidak pernah muncul di
        sini.
      </p>
    </>
  );
}
