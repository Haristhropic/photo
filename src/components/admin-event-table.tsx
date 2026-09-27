"use client";

import { IconCheck, IconPencil, IconTrash, IconX } from "@tabler/icons-react";
import { useState } from "react";

import { adminRequest } from "@/lib/admin-api";

export type EventRow = {
  id: string;
  title: string;
  slug: string;
  accessCode: string | null;
  retentionHours: number;
  sessionCount: number;
  downloadTotal: number;
};

export function AdminEventTable({
  events,
  onChanged,
}: {
  events: EventRow[];
  onChanged: () => void;
}) {
  if (events.length === 0) {
    return <p className="bg-elev p-6 text-ink-body">Belum ada event.</p>;
  }

  return (
    <div className="grid gap-px border border-line bg-line">
      {events.map((event) => (
        <EventItem key={event.id} event={event} onChanged={onChanged} />
      ))}
    </div>
  );
}

function EventItem({ event, onChanged }: { event: EventRow; onChanged: () => void }) {
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

  async function remove() {
    const confirmed = window.confirm(
      `Hapus event "${event.title}"? Frame dan foto sesi ikut dilepas.`,
    );
    if (!confirmed || busy) return;

    setBusy(true);
    setError(null);

    try {
      await adminRequest(`/api/admin/events/${event.id}`, { method: "DELETE" });
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal menghapus event");
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 bg-elev p-6">
        <div className="min-w-0">
          <p className="text-h3 font-semibold">{event.title}</p>
          <p className="mt-1 font-mono text-label tracking-[0.16em] uppercase text-meta">
            /e/{event.slug} / kode {event.accessCode ?? "terbuka"} / retensi{" "}
            {event.retentionHours} jam
          </p>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex gap-6 text-right">
            <div>
              <p className="label">Sesi</p>
              <p className="mt-1 text-h3 font-semibold">{event.sessionCount}</p>
            </div>
            <div>
              <p className="label">Unduhan</p>
              <p className="mt-1 text-h3 font-semibold">{event.downloadTotal}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              reset();
              setEditing(true);
            }}
            aria-label={`Ubah ${event.title}`}
            className="inline-flex size-10 items-center justify-center border border-line text-ink transition-colors hover:border-ink hover:text-accent"
          >
            <IconPencil size={18} stroke={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            aria-label={`Hapus ${event.title}`}
            className="inline-flex size-10 items-center justify-center border border-line text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            <IconTrash size={18} stroke={1.75} aria-hidden="true" />
          </button>
        </div>

        {error && <p className="w-full text-small text-accent">{error}</p>}
      </div>
    );
  }

  return (
    <div className="bg-elev p-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor={`title-${event.id}`} className="label">
            Judul
          </label>
          <input
            id={`title-${event.id}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-2 w-full border border-line bg-sunken px-3 py-2 text-small outline-none focus:border-accent"
          />
        </div>

        <div>
          <label htmlFor={`code-${event.id}`} className="label">
            Kode akses
          </label>
          <input
            id={`code-${event.id}`}
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            placeholder="kosongkan untuk terbuka"
            className="mt-2 w-full border border-line bg-sunken px-3 py-2 text-small outline-none focus:border-accent"
          />
        </div>

        <div>
          <label htmlFor={`retention-${event.id}`} className="label">
            Retensi (jam)
          </label>
          <input
            id={`retention-${event.id}`}
            type="number"
            min={1}
            max={720}
            value={retention}
            onChange={(e) => setRetention(e.target.value)}
            className="mt-2 w-full border border-line bg-sunken px-3 py-2 text-small outline-none focus:border-accent"
          />
        </div>
      </div>

      {error && <p className="mt-3 text-small text-accent">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy || title.trim().length === 0}
          className="inline-flex items-center gap-2 border border-accent bg-accent px-4 py-2 text-small font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          <IconCheck size={18} stroke={1.75} aria-hidden="true" />
          Simpan
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setEditing(false);
          }}
          className="inline-flex items-center gap-2 border border-line-strong px-4 py-2 text-small font-medium text-ink transition-colors hover:border-ink"
        >
          <IconX size={18} stroke={1.75} aria-hidden="true" />
          Batal
        </button>
      </div>
    </div>
  );
}
