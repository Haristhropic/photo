"use client";

import {
  IconCheck,
  IconExternalLink,
  IconPencil,
  IconSearch,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  AdminNotice,
  BTN,
  FIELD,
  LABEL,
  SectionEmpty,
} from "@/components/admin-ui";
import { adminRequest } from "@/lib/admin-api";
import {
  FRAME_CATEGORIES,
  FRAME_CATEGORY_LABEL,
  type FrameCategory,
} from "@/lib/frames";
import { adminThumbnailUrl } from "@/lib/image-url";
import { LAYOUTS, LAYOUT_ORDER, type LayoutType } from "@/lib/layouts";

export type FrameRow = {
  id: string;
  name: string;
  imageUrl: string;
  imagePublicId: string | null;
  imageWidth: number;
  imageHeight: number;
  windows: Array<{ x: number; y: number; w: number; h: number }>;
  category: string;
  layoutType: string;
  eventId: string | null;
  eventTitle: string | null;
};

export type EventOption = { id: string; title: string };

export function AdminFrameTable({
  frames,
  eventOptions,
  onChanged,
}: {
  frames: FrameRow[];
  eventOptions: EventOption[];
  onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<FrameRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!needle) return frames;
    return frames.filter((frame) =>
      [
        frame.name,
        frame.eventTitle ?? "",
        LAYOUTS[frame.layoutType as LayoutType]?.label ?? frame.layoutType,
        FRAME_CATEGORY_LABEL[frame.category as FrameCategory] ?? frame.category,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [frames, needle]);

  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);

    try {
      await adminRequest(`/api/admin/frames/${pendingDelete.id}`, {
        method: "DELETE",
      });
      setPendingDelete(null);
      onChanged();
    } catch (cause) {
      setDeleteError(
        cause instanceof Error ? cause.message : "Gagal menghapus frame",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-small font-semibold text-meta">
          {needle
            ? `${visible.length} dari ${frames.length} frame`
            : `${frames.length} frame`}
        </p>
        <label className="relative block w-full sm:max-w-72">
          <span className="sr-only">Cari frame</span>
          <IconSearch
            size={16}
            stroke={2.5}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-meta"
          />
          <input
            value={query}
            onChange={(changeEvent) => setQuery(changeEvent.target.value)}
            placeholder="Cari nama, layout, atau event"
            className={`${FIELD} mt-0 pl-9`}
          />
        </label>
      </div>

      {deleteError && <AdminNotice tone="error">{deleteError}</AdminNotice>}

      {frames.length === 0 ? (
        <SectionEmpty
          title="Belum ada frame"
          hint="Unggah PNG transparan di panel Unggah frame. Jendela foto dideteksi otomatis."
        />
      ) : visible.length === 0 ? (
        <SectionEmpty
          title="Tidak ada frame yang cocok"
          hint="Coba kata kunci lain, atau kosongkan pencarian."
          action={
            <button
              type="button"
              onClick={() => setQuery("")}
              className={BTN.quiet}
            >
              <IconX size={16} stroke={2.5} aria-hidden="true" />
              Kosongkan pencarian
            </button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((frame) => (
            <FrameItem
              key={frame.id}
              frame={frame}
              eventOptions={eventOptions}
              onChanged={onChanged}
              onRequestDelete={() => {
                setDeleteError(null);
                setPendingDelete(frame);
              }}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Hapus frame?"
        description={
          <>
            Frame{" "}
            <strong className="font-extrabold text-ink">
              {pendingDelete?.name}
            </strong>{" "}
            akan dilepas dari semua event, dan file aslinya dihapus permanen
            dari Cloudinary atau penyimpanan lokal. Foto tamu tidak terpengaruh.
          </>
        }
        icon={<IconTrash size={20} stroke={2.5} aria-hidden="true" />}
        onClose={() => setPendingDelete(null)}
        actions={[
          {
            label: deleting ? "Menghapus..." : "Hapus frame",
            icon: <IconTrash size={20} stroke={2.5} aria-hidden="true" />,
            tone: "danger",
            onClick: confirmDelete,
          },
          {
            label: "Batal",
            icon: <IconX size={20} stroke={2.5} aria-hidden="true" />,
            tone: "neutral",
            onClick: () => setPendingDelete(null),
          },
        ]}
      />
    </div>
  );
}

function FrameItem({
  frame,
  eventOptions,
  onChanged,
  onRequestDelete,
}: {
  frame: FrameRow;
  eventOptions: EventOption[];
  onChanged: () => void;
  onRequestDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(frame.name);
  const [layoutType, setLayoutType] = useState<LayoutType>(
    (frame.layoutType as LayoutType) ?? "STRIP_3",
  );
  const [category, setCategory] = useState<FrameCategory>(
    (frame.category as FrameCategory) ?? "cool",
  );
  const [eventId, setEventId] = useState(frame.eventId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName(frame.name);
    setLayoutType((frame.layoutType as LayoutType) ?? "STRIP_3");
    setCategory((frame.category as FrameCategory) ?? "cool");
    setEventId(frame.eventId ?? "");
    setError(null);
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      await adminRequest(`/api/admin/frames/${frame.id}`, {
        method: "PATCH",
        body: { name, layoutType, category, eventId: eventId || null },
      });
      setEditing(false);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal menyimpan frame");
    } finally {
      setBusy(false);
    }
  }

  const layoutLabel = LAYOUTS[layoutType]?.label ?? frame.layoutType;
  const categoryLabel =
    FRAME_CATEGORY_LABEL[category as FrameCategory] ?? frame.category;

  return (
    <li className="flex flex-col rounded-[var(--radius)] border-2 border-line-soft bg-bg">
      <div className="flex items-start gap-3 border-b-2 border-line-soft bg-sunken/45 px-4 py-3">
        <a
          href={frame.imageUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Buka file frame ${frame.name}`}
          title="Buka file PNG"
          className="pressable grid size-20 shrink-0 place-items-center rounded-[var(--radius-sm)] border-2 border-ink bg-butter"
        >
          <img
            src={adminThumbnailUrl(frame.imageUrl, 160)}
            alt={`Frame ${frame.name}`}
            width={160}
            height={160}
            loading="lazy"
            decoding="async"
            className="max-h-16 w-auto max-w-16 object-contain"
          />
        </a>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[1rem] leading-snug font-extrabold break-words text-ink">
            {frame.name}
          </h3>
          <p className="mt-1 text-small font-semibold text-meta">
            {layoutLabel} · {categoryLabel}
          </p>
          <p className="mt-0.5 truncate text-small font-semibold text-ink-body">
            {frame.eventTitle ?? "Tanpa event"}
          </p>
        </div>
      </div>

      {editing ? (
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="grid gap-3">
            <div>
              <label htmlFor={`frame-name-${frame.id}`} className={LABEL}>
                Nama
              </label>
              <input
                id={`frame-name-${frame.id}`}
                value={name}
                autoFocus
                onChange={(changeEvent) => setName(changeEvent.target.value)}
                className={FIELD}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`frame-layout-${frame.id}`} className={LABEL}>
                  Layout
                </label>
                <select
                  id={`frame-layout-${frame.id}`}
                  value={layoutType}
                  onChange={(changeEvent) =>
                    setLayoutType(changeEvent.target.value as LayoutType)
                  }
                  className={FIELD}
                >
                  {LAYOUT_ORDER.map((key) => (
                    <option key={key} value={key}>
                      {LAYOUTS[key].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`frame-category-${frame.id}`} className={LABEL}>
                  Kategori
                </label>
                <select
                  id={`frame-category-${frame.id}`}
                  value={category}
                  onChange={(changeEvent) =>
                    setCategory(changeEvent.target.value as FrameCategory)
                  }
                  className={FIELD}
                >
                  {FRAME_CATEGORIES.map((key) => (
                    <option key={key} value={key}>
                      {FRAME_CATEGORY_LABEL[key]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor={`frame-event-${frame.id}`} className={LABEL}>
                Event
              </label>
              <select
                id={`frame-event-${frame.id}`}
                value={eventId}
                onChange={(changeEvent) => setEventId(changeEvent.target.value)}
                className={FIELD}
              >
                <option value="">Tanpa event (global)</option>
                {eventOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <AdminNotice tone="error">{error}</AdminNotice>}

          <div className="mt-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy || name.trim().length === 0}
              className={BTN.save}
            >
              <IconCheck size={16} stroke={2.5} aria-hidden="true" />
              {busy ? "Menyimpan..." : "Simpan"}
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                setEditing(false);
              }}
              className={BTN.quiet}
            >
              <IconX size={16} stroke={2.5} aria-hidden="true" />
              Batal
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3 p-4">
          <dl className="grid grid-cols-3 gap-3">
            <FrameStat label="Ukuran" value={`${frame.imageWidth}×${frame.imageHeight}`} />
            <FrameStat label="Jendela" value={String(frame.windows.length)} />
            <FrameStat
              label="Penyimpanan"
              value={frame.imagePublicId ? "Cloudinary" : "Lokal"}
            />
          </dl>

          <div className="mt-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                reset();
                setEditing(true);
              }}
              className={BTN.quiet}
            >
              <IconPencil size={16} stroke={2.5} aria-hidden="true" />
              Ubah
            </button>
            <button type="button" onClick={onRequestDelete} className={BTN.danger}>
              <IconTrash size={16} stroke={2.5} aria-hidden="true" />
              Hapus
            </button>
            <a
              href={frame.imageUrl}
              target="_blank"
              rel="noreferrer"
              className={`${BTN.icon} ml-auto`}
              aria-label={`Buka file frame ${frame.name} di tab baru`}
              title="Buka PNG"
            >
              <IconExternalLink size={17} stroke={2.5} aria-hidden="true" />
            </a>
          </div>
        </div>
      )}
    </li>
  );
}

function FrameStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-display text-[0.72rem] font-bold text-meta">
        {label}
      </dt>
      <dd className="mt-0.5 text-small font-bold tabular-nums text-ink">
        {value}
      </dd>
    </div>
  );
}
