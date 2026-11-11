"use client";

import {
  IconExternalLink,
  IconEyeOff,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  AdminMetrics,
  AdminNotice,
  AdminPanel,
  BTN,
  SectionEmpty,
  formatDate,
} from "@/components/admin-ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { adminRequest } from "@/lib/admin-api";
import {
  FILTERS,
  LAYOUTS,
  type FilterKey,
  type LayoutType,
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

type PendingAction = { kind: "unpublish" | "delete"; photo: StoragePhoto };

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
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(
    null,
  );

  function ask(kind: PendingAction["kind"], photo: StoragePhoto) {
    setError(null);
    setPending({ kind, photo });
  }

  async function confirm() {
    if (!pending || busyId) return;

    const { kind, photo } = pending;
    setBusyId(photo.id);
    setError(null);

    try {
      await adminRequest(
        `/api/admin/photos/${photo.id}`,
        kind === "delete"
          ? { method: "DELETE" }
          : { method: "PATCH", body: { published: false } },
      );
      setPending(null);
      router.refresh();
    } catch (cause) {
      setError({
        id: photo.id,
        message:
          cause instanceof Error ? cause.message : "Gagal memproses foto",
      });
      setPending(null);
    } finally {
      setBusyId(null);
    }
  }

  const pendingLabel = pending?.photo.eventTitle ?? "Booth terbuka";
  const deleting = pending?.kind === "delete";

  return (
    <main className="flex-1">
      <div className="shell py-[var(--page)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-[1.5rem] leading-none font-extrabold text-ink sm:text-[2rem]">
              Storage
            </h1>
            <p className="mt-2 max-w-[60ch] text-small font-semibold text-ink-body">
              Kontrol foto yang tampil di galeri publik. Sembunyikan tanpa
              menghapus salinan privat tamu, atau hapus permanen beserta aset
              Cloudinary-nya.
            </p>
          </div>
          <Link
            href="/gallery"
            target="_blank"
            rel="noreferrer"
            className={BTN.quiet}
          >
            <IconExternalLink size={16} stroke={2.5} aria-hidden="true" />
            Buka galeri
          </Link>
        </div>

        <div className="mt-6">
          <AdminMetrics
            items={[
              {
                label: "Foto publik",
                value: totals.publicPhotos,
                hint: "tampil di galeri",
              },
              {
                label: "Sesi privat",
                value: totals.privateSessions,
                hint: "tidak tampil publik",
              },
              {
                label: "Total sesi",
                value: totals.totalSessions,
                hint: "termasuk foto publik",
              },
              {
                label: "Di halaman ini",
                value: photos.length,
                hint:
                  totalPages > 1
                    ? `halaman ${page} dari ${totalPages}`
                    : "semua foto publik",
              },
            ]}
          />
        </div>

        <div className="mt-5">
          <AdminPanel
            title="Foto publik"
            description="Urut dari yang paling baru tampil."
          >
            {photos.length === 0 ? (
              <SectionEmpty
                title="Belum ada foto publik"
                hint="Foto muncul di sini setelah tamu mencentang “Tampilkan di galeri” di studio."
              />
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {photos.map((photo) => {
                  const layout =
                    LAYOUTS[photo.layoutType as LayoutType] ?? LAYOUTS.STRIP_3;
                  const filter = FILTERS[photo.filterKey as FilterKey];
                  const busy = busyId === photo.id;
                  const label = photo.eventTitle ?? "Booth terbuka";

                  return (
                    <li
                      key={photo.id}
                      className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius)] border-2 border-line-soft bg-bg"
                    >
                      <a
                        href={photo.cloudinaryUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Buka foto ${label} di tab baru`}
                        className="grid h-64 place-items-center border-b-2 border-line-soft bg-sunken p-3"
                      >
                        <img
                          src={adminThumbnailUrl(photo.cloudinaryUrl, 360)}
                          alt={`Foto ${layout.label} dari ${label}`}
                          width={layout.canvas.w}
                          height={layout.canvas.h}
                          loading="lazy"
                          decoding="async"
                          className="max-h-56 w-auto max-w-full object-contain"
                        />
                      </a>

                      <div className="flex flex-1 flex-col gap-3 p-3.5">
                        <div className="min-w-0">
                          <p className="truncate font-display text-[1rem] leading-snug font-extrabold text-ink">
                            {label}
                          </p>
                          <p className="mt-0.5 text-small font-semibold text-meta">
                            {layout.label} · {filter?.label ?? photo.filterKey}{" "}
                            · {formatDate(photo.publishedAt)}
                          </p>
                        </div>

                        <div className="mt-auto flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => ask("unpublish", photo)}
                            disabled={busy}
                            className={BTN.quiet}
                          >
                            <IconEyeOff
                              size={16}
                              stroke={2.5}
                              aria-hidden="true"
                            />
                            {busy ? "Memproses..." : "Sembunyikan"}
                          </button>
                          <button
                            type="button"
                            onClick={() => ask("delete", photo)}
                            disabled={busy}
                            className={BTN.danger}
                          >
                            <IconTrash
                              size={16}
                              stroke={2.5}
                              aria-hidden="true"
                            />
                            Hapus
                          </button>
                        </div>

                        {error?.id === photo.id && (
                          <AdminNotice tone="error">{error.message}</AdminNotice>
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
                className="mt-4 flex items-center justify-between gap-3 border-t-2 border-ink pt-4"
              >
                {page > 1 ? (
                  <Link
                    href={`/admin/storage?page=${page - 1}`}
                    className={BTN.quiet}
                  >
                    Sebelumnya
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className={`${BTN.quiet} pointer-events-none opacity-45`}
                  >
                    Sebelumnya
                  </span>
                )}
                <span className="font-display text-small font-extrabold tabular-nums text-ink">
                  {page} / {totalPages}
                </span>
                {page < totalPages ? (
                  <Link
                    href={`/admin/storage?page=${page + 1}`}
                    className={BTN.quiet}
                  >
                    Berikutnya
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className={`${BTN.quiet} pointer-events-none opacity-45`}
                  >
                    Berikutnya
                  </span>
                )}
              </nav>
            )}
          </AdminPanel>
        </div>
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={deleting ? "Hapus foto permanen?" : "Sembunyikan dari galeri?"}
        description={
          deleting ? (
            <>
              Foto{" "}
              <strong className="font-extrabold text-ink">{pendingLabel}</strong>{" "}
              akan dihapus permanen, termasuk aset Cloudinary dan salinan privat
              yang bisa dibuka tamu lewat link hasil.
            </>
          ) : (
            <>
              Foto{" "}
              <strong className="font-extrabold text-ink">{pendingLabel}</strong>{" "}
              akan hilang dari galeri publik. Salinan privat tamu tetap bisa
              dibuka lewat link hasil, dan aset Cloudinary publiknya ikut
              dibersihkan.
            </>
          )
        }
        icon={<IconTrash size={20} stroke={2.5} aria-hidden="true" />}
        onClose={() => {
          if (!busyId) setPending(null);
        }}
        actions={[
          {
            label:
              busyId !== null
                ? "Memproses..."
                : deleting
                  ? "Hapus permanen"
                  : "Sembunyikan",
            icon: deleting ? (
              <IconTrash size={20} stroke={2.5} aria-hidden="true" />
            ) : (
              <IconEyeOff size={20} stroke={2.5} aria-hidden="true" />
            ),
            tone: deleting ? "danger" : "primary",
            onClick: confirm,
          },
          {
            label: "Batal",
            icon: <IconX size={20} stroke={2.5} aria-hidden="true" />,
            tone: "neutral",
            onClick: () => setPending(null),
          },
        ]}
      />
    </main>
  );
}
