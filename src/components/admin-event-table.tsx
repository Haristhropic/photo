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
  CopyButton,
  FIELD,
  LABEL,
  SectionEmpty,
  eventLink,
  formatExpiry,
} from "@/components/admin-ui";
import { adminRequest } from "@/lib/admin-api";

export type EventRow = {
  id: string;
  title: string;
  slug: string;
  accessCode: string | null;
  retentionHours: number;
  createdAt: string;
  sessionCount: number;
  downloadTotal: number;
  activeSessions: number;
  nextExpiry: string | null;
  frameCount: number;
};

export function AdminEventTable({
  events,
  onChanged,
}: {
  events: EventRow[];
  onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<EventRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!needle) return events;
    return events.filter((event) =>
      `${event.title} ${event.slug} ${event.accessCode ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [events, needle]);

  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);

    try {
      await adminRequest(`/api/admin/events/${pendingDelete.id}`, {
        method: "DELETE",
      });
      setPendingDelete(null);
      onChanged();
    } catch (cause) {
      setDeleteError(
        cause instanceof Error ? cause.message : "Gagal menghapus event",
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
            ? `${visible.length} dari ${events.length} event`
            : `${events.length} event`}
        </p>
        <label className="relative block w-full sm:max-w-72">
          <span className="sr-only">Cari event</span>
          <IconSearch
            size={16}
            stroke={2.5}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-meta"
          />
          <input
            value={query}
            onChange={(changeEvent) => setQuery(changeEvent.target.value)}
            placeholder="Cari judul, slug, atau kode"
            className={`${FIELD} mt-0 pl-9`}
          />
        </label>
      </div>

      {deleteError && <AdminNotice tone="error">{deleteError}</AdminNotice>}

      {events.length === 0 ? (
        <SectionEmpty
          title="Belum ada event"
          hint="Buat event pertama di panel Buat event, lalu bagikan linknya ke tamu."
        />
      ) : visible.length === 0 ? (
        <SectionEmpty
          title="Tidak ada event yang cocok"
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
        <ul className="flex flex-col gap-3">
          {visible.map((event) => (
            <EventItem
              key={event.id}
              event={event}
              onChanged={onChanged}
              onRequestDelete={() => {
                setDeleteError(null);
                setPendingDelete(event);
              }}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Hapus event?"
        description={
          <>
            <strong className="font-extrabold text-ink">
              {pendingDelete?.title}
            </strong>{" "}
            beserta frame miliknya akan dihapus, termasuk file frame di
            Cloudinary. Foto tamu tidak ikut terhapus; sesinya hanya dilepas dari
            event dan tetap bisa dibuka lewat link hasil.
          </>
        }
        icon={<IconTrash size={20} stroke={2.5} aria-hidden="true" />}
        onClose={() => setPendingDelete(null)}
        actions={[
          {
            label: deleting ? "Menghapus..." : "Hapus event",
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

function EventItem({
  event,
  onChanged,
  onRequestDelete,
}: {
  event: EventRow;
  onChanged: () => void;
  onRequestDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [accessCode, setAccessCode] = useState(event.accessCode ?? "");
  const [retention, setRetention] = useState(String(event.retentionHours));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle(event.title);
    setAccessCode(event.accessCode ?? "");
    setRetention(String(event.retentionHours));
    setError(null);
  }

  function cancel() {
    reset();
    setEditing(false);
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      await adminRequest(`/api/admin/events/${event.id}`, {
        method: "PATCH",
        body: {
          title,
          accessCode: accessCode.trim() || null,
          retentionHours: Number(retention),
        },
      });
      setEditing(false);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal menyimpan event");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="rounded-[var(--radius)] border-2 border-line-strong bg-elev p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor={`title-${event.id}`} className={LABEL}>
              Judul
            </label>
            <input
              id={`title-${event.id}`}
              value={title}
              autoFocus
              onChange={(changeEvent) => setTitle(changeEvent.target.value)}
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor={`code-${event.id}`} className={LABEL}>
              Kode akses
            </label>
            <input
              id={`code-${event.id}`}
              value={accessCode}
              placeholder="Kosongkan untuk terbuka"
              onChange={(changeEvent) => setAccessCode(changeEvent.target.value)}
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor={`retention-${event.id}`} className={LABEL}>
              Retensi (jam)
            </label>
            <input
              id={`retention-${event.id}`}
              type="number"
              min={1}
              max={720}
              value={retention}
              onChange={(changeEvent) => setRetention(changeEvent.target.value)}
              className={FIELD}
            />
          </div>
        </div>

        {error && (
          <div className="mt-3">
            <AdminNotice tone="error">{error}</AdminNotice>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={busy || title.trim().length === 0}
            className={BTN.save}
          >
            <IconCheck size={16} stroke={2.5} aria-hidden="true" />
            {busy ? "Menyimpan..." : "Simpan"}
          </button>
          <button type="button" onClick={cancel} className={BTN.quiet}>
            <IconX size={16} stroke={2.5} aria-hidden="true" />
            Batal
          </button>
        </div>
      </li>
    );
  }

  const expiry = formatExpiry(event.nextExpiry);

  return (
    <li className="rounded-[var(--radius)] border-2 border-line-soft bg-bg">
      <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:gap-5">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[1.05rem] leading-snug font-extrabold break-words text-ink">
            {event.title}
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-small font-semibold text-meta">
            <span className="break-all">/e/{event.slug}</span>
            <span aria-hidden="true">·</span>
            <span>
              {event.accessCode ? `Kode ${event.accessCode}` : "Tanpa kode"}
            </span>
            <span aria-hidden="true">·</span>
            <span>Retensi {event.retentionHours} jam</span>
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-small font-semibold">
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rounded-full border border-ink ${
                event.activeSessions > 0 ? "bg-mint" : "bg-sunken"
              }`}
            />
            <span className="text-ink-body">
              {event.activeSessions > 0 && expiry
                ? `${event.activeSessions} sesi aktif, berikutnya kedaluwarsa ${expiry}`
                : event.activeSessions > 0
                  ? `${event.activeSessions} sesi aktif`
                  : "Tidak ada sesi aktif"}
            </span>
          </p>
        </div>

        <dl className="grid w-full grid-cols-4 gap-3 sm:max-w-xs lg:w-64">
          <RowStat label="Sesi" value={event.sessionCount} />
          <RowStat label="Aktif" value={event.activeSessions} />
          <RowStat label="Unduh" value={event.downloadTotal} />
          <RowStat label="Frame" value={event.frameCount} />
        </dl>

        <div className="flex items-center gap-1.5">
          <CopyButton
            value={() => eventLink(event.slug)}
            label={`Salin link ${event.title}`}
            copiedLabel="Link tersalin"
            className={BTN.icon}
            showLabel={false}
          />
          <a
            href={`/e/${event.slug}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`Buka halaman event ${event.title}`}
            title="Buka halaman event"
            className={BTN.icon}
          >
            <IconExternalLink size={17} stroke={2.5} aria-hidden="true" />
          </a>
          <button
            type="button"
            onClick={() => {
              reset();
              setEditing(true);
            }}
            aria-label={`Ubah ${event.title}`}
            title="Ubah event"
            className={BTN.icon}
          >
            <IconPencil size={17} stroke={2.5} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onRequestDelete}
            aria-label={`Hapus ${event.title}`}
            title="Hapus event"
            className={BTN.iconDanger}
          >
            <IconTrash size={17} stroke={2.5} aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  );
}

function RowStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="font-display text-[0.72rem] font-bold text-meta">
        {label}
      </dt>
      <dd className="mt-0.5 font-display text-[1.05rem] leading-none font-extrabold tabular-nums text-ink">
        {value}
      </dd>
    </div>
  );
}
