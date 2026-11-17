"use client";

import {
  IconCheck,
  IconExternalLink,
  IconEyeOff,
  IconMinus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

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
};

type PendingAction = { kind: "unpublish" | "delete"; photos: StoragePhoto[] };

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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [error, setError] = useState<{ id?: string; message: string } | null>(
    null,
  );
  const lastIndexRef = useRef<number | null>(null);
  const shiftPressedRef = useRef(false);

  const visibleIds = new Set(photos.map((photo) => photo.id));
  const activeSelectedIds = selectedIds.filter((id) => visibleIds.has(id));
  const selectedPhotos = photos.filter((photo) =>
    activeSelectedIds.includes(photo.id),
  );
  const allSelected =
    photos.length > 0 && activeSelectedIds.length === photos.length;
  const someSelected =
    activeSelectedIds.length > 0 && activeSelectedIds.length < photos.length;
  const isBusy = busyIds.length > 0;

  function toggleOne(id: string, index: number, shiftKey: boolean) {
    if (isBusy) return;

    const anchor = lastIndexRef.current;
    if (shiftKey && anchor !== null && anchor !== index) {
      const start = Math.min(anchor, index);
      const end = Math.max(anchor, index);
      const rangeIds = photos.slice(start, end + 1).map((photo) => photo.id);
      const shouldSelect = !activeSelectedIds.includes(id);

      setSelectedIds((current) => {
        if (shouldSelect) {
          const next = new Set(current);
          for (const rangeId of rangeIds) next.add(rangeId);
          return Array.from(next);
        }
        const removeSet = new Set(rangeIds);
        return current.filter((item) => !removeSet.has(item));
      });
    } else {
      setSelectedIds((current) =>
        current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id],
      );
    }

    lastIndexRef.current = index;
  }

  function toggleAll() {
    if (isBusy) return;
    lastIndexRef.current = null;
    setSelectedIds(allSelected ? [] : photos.map((photo) => photo.id));
  }

  function clearSelection() {
    if (isBusy) return;
    lastIndexRef.current = null;
    setSelectedIds([]);
  }

  function ask(kind: PendingAction["kind"], targetPhotos: StoragePhoto[]) {
    if (targetPhotos.length === 0 || isBusy) return;
    setError(null);
    setPending({ kind, photos: targetPhotos });
  }

  async function confirm() {
    if (!pending || isBusy) return;

    const { kind, photos: targetPhotos } = pending;
    setBusyIds(targetPhotos.map((photo) => photo.id));
    setError(null);

    const succeeded: string[] = [];
    let firstError: { id?: string; message: string } | null = null;

    for (const photo of targetPhotos) {
      try {
        await adminRequest(
          `/api/admin/photos/${photo.id}`,
          kind === "delete"
            ? { method: "DELETE" }
            : { method: "PATCH", body: { published: false } },
        );
        succeeded.push(photo.id);
      } catch (cause) {
        if (!firstError) {
          firstError = {
            id: targetPhotos.length === 1 ? photo.id : undefined,
            message:
              cause instanceof Error ? cause.message : "Gagal memproses foto",
          };
        }
      }
    }

    if (succeeded.length > 0) {
      setSelectedIds((current) =>
        current.filter((id) => !succeeded.includes(id)),
      );
      router.refresh();
    }
    if (firstError) {
      setError(firstError);
    }

    setPending(null);
    setBusyIds([]);
  }

  const pendingLabel = "Booth terbuka";
  const deleting = pending?.kind === "delete";
  const pendingCount = pending?.photos.length ?? 0;

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
              <>
                <div
                  className={`sticky top-[4.5rem] z-20 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border-2 border-ink px-3.5 py-2.5 transition-colors ${
                    activeSelectedIds.length > 0
                      ? "bg-butter shadow-lift-1"
                      : "bg-elev"
                  }`}
                >
                  <label className="group/all inline-flex min-h-9 cursor-pointer items-center gap-2.5 select-none">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      disabled={isBusy}
                      onChange={toggleAll}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`grid size-5 shrink-0 place-items-center rounded-[6px] border-2 border-ink transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ink peer-focus-visible:ring-offset-2 ${
                        allSelected || someSelected
                          ? "bg-ink text-elev"
                          : "bg-elev text-transparent group-hover/all:bg-butter/60"
                      }`}
                    >
                      {someSelected ? (
                        <IconMinus size={14} stroke={3} />
                      ) : (
                        <IconCheck size={14} stroke={3} />
                      )}
                    </span>
                    <span className="font-display text-small font-extrabold text-ink">
                      {allSelected ? "Batal pilih semua" : "Pilih semua"}
                    </span>
                  </label>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-small font-semibold tabular-nums text-ink-body">
                      {activeSelectedIds.length > 0
                        ? `${activeSelectedIds.length} dari ${photos.length} dipilih`
                        : "Pilih foto untuk aksi massal · Shift+klik untuk rentang"}
                    </span>
                    {activeSelectedIds.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={clearSelection}
                          disabled={isBusy}
                          className={BTN.quiet}
                        >
                          <IconX size={16} stroke={2.5} aria-hidden="true" />
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={() => ask("unpublish", selectedPhotos)}
                          disabled={isBusy}
                          className={BTN.quiet}
                        >
                          <IconEyeOff
                            size={16}
                            stroke={2.5}
                            aria-hidden="true"
                          />
                          {isBusy
                            ? "Memproses..."
                            : `Sembunyikan (${activeSelectedIds.length})`}
                        </button>
                        <button
                          type="button"
                          onClick={() => ask("delete", selectedPhotos)}
                          disabled={isBusy}
                          className={BTN.danger}
                        >
                          <IconTrash
                            size={16}
                            stroke={2.5}
                            aria-hidden="true"
                          />
                          Hapus ({activeSelectedIds.length})
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {error && !error.id && (
                  <div className="mb-4">
                    <AdminNotice tone="error">{error.message}</AdminNotice>
                  </div>
                )}

                <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {photos.map((photo, index) => {
                    const layout =
                      LAYOUTS[photo.layoutType as LayoutType] ?? LAYOUTS.STRIP_3;
                    const filter = FILTERS[photo.filterKey as FilterKey];
                    const busy = busyIds.includes(photo.id);
                    const checked = activeSelectedIds.includes(photo.id);
                    const label = "Booth terbuka";

                    return (
                      <li
                        key={photo.id}
                        className={`flex min-w-0 flex-col overflow-hidden rounded-[var(--radius)] border-2 transition-colors ${
                          checked
                            ? "border-ink bg-butter/25"
                            : "border-line-soft bg-bg"
                        }`}
                      >
                        <a
                          href={photo.cloudinaryUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Buka foto ${label} di tab baru`}
                          className="grid h-64 place-items-center border-b-2 border-line-soft bg-sunken p-3 transition-colors hover:bg-sunken/80"
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
                          <label
                            className={`group/item -mx-1.5 -mt-1 flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] px-1.5 py-1.5 transition-colors select-none ${
                              checked
                                ? "bg-butter/40"
                                : "hover:bg-sunken/70"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isBusy}
                              onClick={(event) => {
                                shiftPressedRef.current = event.shiftKey;
                              }}
                              onChange={() => {
                                const withShift = shiftPressedRef.current;
                                shiftPressedRef.current = false;
                                toggleOne(photo.id, index, withShift);
                              }}
                              aria-label={`Pilih foto ${layout.label} (${formatDate(photo.publishedAt)})`}
                              className="peer sr-only"
                            />
                            <span
                              aria-hidden="true"
                              className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] border-2 border-ink transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ink peer-focus-visible:ring-offset-2 ${
                                checked
                                  ? "bg-ink text-elev"
                                  : "bg-elev text-transparent group-hover/item:bg-butter/60"
                              }`}
                            >
                              <IconCheck size={14} stroke={3} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-display text-[1rem] leading-snug font-extrabold text-ink">
                                {label}
                              </p>
                              <p className="mt-0.5 text-small font-semibold text-meta">
                                {layout.label} ·{" "}
                                {filter?.label ?? photo.filterKey} ·{" "}
                                {formatDate(photo.publishedAt)}
                              </p>
                            </div>
                          </label>

                          <div className="mt-auto flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => ask("unpublish", [photo])}
                              disabled={isBusy}
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
                              onClick={() => ask("delete", [photo])}
                              disabled={isBusy}
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
                            <AdminNotice tone="error">
                              {error.message}
                            </AdminNotice>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
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
        title={
          deleting
            ? pendingCount > 1
              ? `Hapus ${pendingCount} foto permanen?`
              : "Hapus foto permanen?"
            : pendingCount > 1
              ? `Sembunyikan ${pendingCount} foto dari galeri?`
              : "Sembunyikan dari galeri?"
        }
        description={
          deleting ? (
            <>
              {pendingCount > 1 ? (
                <>
                  <strong className="font-extrabold text-ink">
                    {pendingCount} foto terpilih
                  </strong>{" "}
                </>
              ) : (
                <>
                  Foto{" "}
                  <strong className="font-extrabold text-ink">
                    {pendingLabel}
                  </strong>{" "}
                </>
              )}
              akan dihapus permanen, termasuk aset Cloudinary dan salinan privat
              yang bisa dibuka tamu lewat link hasil.
            </>
          ) : (
            <>
              {pendingCount > 1 ? (
                <>
                  <strong className="font-extrabold text-ink">
                    {pendingCount} foto terpilih
                  </strong>{" "}
                </>
              ) : (
                <>
                  Foto{" "}
                  <strong className="font-extrabold text-ink">
                    {pendingLabel}
                  </strong>{" "}
                </>
              )}
              akan hilang dari galeri publik. Salinan privat tamu tetap bisa
              dibuka lewat link hasil, dan aset Cloudinary publiknya ikut
              dibersihkan.
            </>
          )
        }
        icon={<IconTrash size={20} stroke={2.5} aria-hidden="true" />}
        onClose={() => {
          if (!isBusy) setPending(null);
        }}
        actions={[
          {
            label: isBusy
              ? "Memproses..."
              : deleting
                ? pendingCount > 1
                  ? `Hapus ${pendingCount} permanen`
                  : "Hapus permanen"
                : pendingCount > 1
                  ? `Sembunyikan (${pendingCount})`
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
