"use client";

import { IconEyeOff, IconTrash } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { adminRequest } from "@/lib/admin-api";
import {
  LAYOUTS,
  type FilterKey,
  type LayoutType,
  FILTERS,
} from "@/lib/layouts";
import { adminThumbnailUrl } from "@/lib/image-url";

export type StoragePhoto = {
  id: string;
  cloudinaryUrl: string;
  layoutType: string;
  filterKey: string;
  publishedAt: string;
  eventTitle: string | null;
};

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AdminStorage({
  photos,
  totals,
  page,
  totalPages,
}: {
  photos: StoragePhoto[];
  totals: {
    publicPhotos: number;
    privateSessions: number;
    totalSessions: number;
  };
  page: number;
  totalPages: number;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(
    null,
  );

  async function unpublish(photo: StoragePhoto) {
    const label = photo.eventTitle ?? "tanpa event";
    const confirmed = window.confirm(
      `Sembunyikan foto ${label} dari galeri publik? Salinan privat tamu tetap bisa dibuka lewat link hasil.`,
    );
    if (!confirmed || busyId) return;

    setBusyId(photo.id);
    setError(null);

    try {
      await adminRequest(`/api/admin/photos/${photo.id}`, {
        method: "PATCH",
        body: { published: false },
      });
      router.refresh();
    } catch (cause) {
      setError({
        id: photo.id,
        message:
          cause instanceof Error ? cause.message : "Gagal menyembunyikan foto",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(photo: StoragePhoto) {
    const label = photo.eventTitle ?? "tanpa event";
    const confirmed = window.confirm(
      `Hapus foto ${label} permanen? Aset Cloudinary dan salinan privat tamu ikut dihapus.`,
    );
    if (!confirmed || busyId) return;

    setBusyId(photo.id);
    setError(null);

    try {
      await adminRequest(`/api/admin/photos/${photo.id}`, {
        method: "DELETE",
      });
      router.refresh();
    } catch (cause) {
      setError({
        id: photo.id,
        message: cause instanceof Error ? cause.message : "Gagal menghapus foto",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <main className="flex-1">
        <div className="shell py-[var(--page)]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-[var(--measure)]">
              <h1 className="text-display font-extrabold">Storage</h1>
              <p className="mt-3 text-lead text-ink-body">
                Kontrol foto yang tampil di galeri publik. Sembunyikan tanpa
                menghapus salinan privat tamu, atau hapus permanen beserta aset
                Cloudinary-nya.
              </p>
            </div>
            <Link
              href="/gallery"
              className="pressable inline-flex items-center justify-center rounded-[var(--radius-pill)] border-2 border-ink bg-elev px-5 py-2.5 font-display text-label font-bold tracking-[0.1em] text-ink uppercase shadow-lift-1 hover:bg-butter"
            >
              Buka galeri
            </Link>
          </div>

          <dl className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-[var(--radius-lg)] border-2 border-ink bg-elev p-6 shadow-lift-1">
              <dt className="font-display text-label font-extrabold tracking-[0.12em] text-ink-meta uppercase">
                Foto publik
              </dt>
              <dd className="mt-2 font-display text-h2 font-extrabold tabular-nums text-ink">
                {totals.publicPhotos}
              </dd>
            </div>
            <div className="rounded-[var(--radius-lg)] border-2 border-ink bg-elev p-6 shadow-lift-1">
              <dt className="font-display text-label font-extrabold tracking-[0.12em] text-ink-meta uppercase">
                Sesi privat
              </dt>
              <dd className="mt-2 font-display text-h2 font-extrabold tabular-nums text-ink">
                {totals.privateSessions}
              </dd>
            </div>
            <div className="rounded-[var(--radius-lg)] border-2 border-ink bg-elev p-6 shadow-lift-1">
              <dt className="font-display text-label font-extrabold tracking-[0.12em] text-ink-meta uppercase">
                Total sesi
              </dt>
              <dd className="mt-2 font-display text-h2 font-extrabold tabular-nums text-ink">
                {totals.totalSessions}
              </dd>
            </div>
          </dl>

          <section className="mt-12">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-h2 font-extrabold">
                Foto publik
              </h2>
              <p className="text-small font-semibold text-ink-meta">
                {totals.publicPhotos === 0
                  ? "Belum ada"
                  : `Halaman ${page} dari ${totalPages}`}
              </p>
            </div>

            {photos.length === 0 ? (
              <div className="mt-6 rounded-[var(--radius)] border-2 border-ink bg-sunken p-6">
                <p className="font-display text-lead font-extrabold text-ink">
                  Belum ada foto publik
                </p>
                <p className="mt-2 text-ink-body">
                  Foto muncul di sini setelah ada tamu yang mencentang
                  &quot;Tampilkan di galeri&quot; di studio.
                </p>
              </div>
            ) : (
              <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {photos.map((photo) => {
                  const layout =
                    LAYOUTS[photo.layoutType as LayoutType] ?? LAYOUTS.STRIP_3;
                  const filter = FILTERS[photo.filterKey as FilterKey];
                  const busy = busyId === photo.id;

                  return (
                    <li
                      key={photo.id}
                      className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border-2 border-ink bg-elev shadow-lift-2"
                    >
                      <div className="grid aspect-[4/5] place-items-center border-b-2 border-ink bg-sunken p-3">
                        <img
                          src={adminThumbnailUrl(photo.cloudinaryUrl, 360)}
                          alt={`Foto ${layout.label} dari ${photo.eventTitle ?? "booth terbuka"}`}
                          width={layout.canvas.w}
                          height={layout.canvas.h}
                          loading="lazy"
                          decoding="async"
                          className="max-h-full w-auto max-w-full object-contain"
                        />
                      </div>

                      <div className="flex flex-1 flex-col gap-3 p-4">
                        <div className="min-w-0">
                          <p className="truncate font-display text-h3 font-extrabold text-ink">
                            {photo.eventTitle ?? "Booth terbuka"}
                          </p>
                          <p className="mt-1 font-display text-label font-bold tracking-[0.08em] text-ink-meta uppercase">
                            {layout.label} / {filter?.label ?? photo.filterKey} /{" "}
                            {formatDate(photo.publishedAt)}
                          </p>
                        </div>

                        <div className="mt-auto flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => unpublish(photo)}
                            disabled={busy}
                            className="pressable inline-flex min-h-10 items-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-butter px-3 py-2 font-display text-small font-bold text-ink shadow-lift-1 hover:bg-mint disabled:opacity-45"
                          >
                            <IconEyeOff size={17} stroke={2.5} aria-hidden="true" />
                            {busy ? "Memproses..." : "Sembunyikan"}
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(photo)}
                            disabled={busy}
                            className="pressable inline-flex min-h-10 items-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-pink px-3 py-2 font-display text-small font-bold text-ink shadow-lift-1 hover:bg-[var(--mix-coral)] disabled:opacity-45"
                          >
                            <IconTrash size={17} stroke={2.5} aria-hidden="true" />
                            Hapus
                          </button>
                        </div>

                        {error?.id === photo.id && (
                          <p
                            role="alert"
                            className="rounded-[var(--radius)] border-2 border-ink bg-pink px-3 py-2 text-small font-semibold text-ink"
                          >
                            {error.message}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {totalPages > 1 && (
              <nav
                aria-label="Halaman foto publik"
                className="mt-8 flex flex-wrap items-center gap-2"
              >
                {page > 1 ? (
                  <Link
                    href={`/admin/storage?page=${page - 1}`}
                    className="pressable inline-flex items-center rounded-[var(--radius-pill)] border-2 border-ink bg-elev px-5 py-2.5 font-display text-label font-bold tracking-[0.1em] text-ink uppercase shadow-lift-1 hover:bg-butter"
                  >
                    Sebelumnya
                  </Link>
                ) : (
                  <span className="inline-flex items-center rounded-[var(--radius-pill)] border-2 border-ink bg-sunken px-5 py-2.5 font-display text-label font-bold tracking-[0.1em] text-ink-meta uppercase opacity-60">
                    Sebelumnya
                  </span>
                )}
                <span className="px-2 font-display text-label font-bold text-ink-meta">
                  {page} / {totalPages}
                </span>
                {page < totalPages ? (
                  <Link
                    href={`/admin/storage?page=${page + 1}`}
                    className="pressable inline-flex items-center rounded-[var(--radius-pill)] border-2 border-ink bg-elev px-5 py-2.5 font-display text-label font-bold tracking-[0.1em] text-ink uppercase shadow-lift-1 hover:bg-butter"
                  >
                    Berikutnya
                  </Link>
                ) : (
                  <span className="inline-flex items-center rounded-[var(--radius-pill)] border-2 border-ink bg-sunken px-5 py-2.5 font-display text-label font-bold tracking-[0.1em] text-ink-meta uppercase opacity-60">
                    Berikutnya
                  </span>
                )}
              </nav>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
