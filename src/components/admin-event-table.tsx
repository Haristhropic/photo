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
    <div className="grid gap-4">
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
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] border-2 border-ink bg-elev p-6 shadow-lift-1">
        <div className="min-w-0">
          <p className="font-display text-h3 font-extrabold">{event.title}</p>
          <p className="mt-1 font-display text-label font-bold tracking-[0.08em] text-ink-meta">
            /e/{event.slug} / kode {event.accessCode ?? "terbuka"} / retensi{" "}
            {event.retentionHours} jam
          </p>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex gap-6 text-right">
            <div>
              <p className="font-display text-label font-extrabold tracking-[0.1em] text-ink-meta uppercase">Sesi</p>
              <p className="mt-1 text-h3 font-semibold">{event.sessionCount}</p>
            </div>
            <div>
              <p className="font-display text-label font-extrabold tracking-[0.1em] text-ink-meta uppercase">Unduhan</p>
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
            className="pressable inline-flex size-11 items-center justify-center rounded-[var(--radius)] border-2 border-ink bg-elev text-ink shadow-lift-1 hover:bg-butter"
          >
            <IconPencil size={18} stroke={2.5} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            aria-label={`Hapus ${event.title}`}
            className="pressable inline-flex size-11 items-center justify-center rounded-[var(--radius)] border-2 border-ink bg-elev text-ink shadow-lift-1 hover:bg-pink disabled:opacity-45"
          >
            <IconTrash size={18} stroke={2.5} aria-hidden="true" />
          </button>
        </div>

        {error && <p className="w-full rounded-[var(--radius)] border-2 border-ink bg-pink px-3 py-2 text-small font-semibold text-ink">{error}</p>}
      </div>
    );
  }

  return (
    <div className="bg-elev p-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor={`title-${event.id}`} className="font-display text-label font-extrabold tracking-[0.1em] text-ink-meta uppercase">
            Judul
          </label>
          <input
            id={`title-${event.id}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-2 w-full rounded-[var(--radius)] border-2 border-ink bg-elev px-3 py-2 text-small font-semibold text-ink outline-none focus:bg-butter"
          />
        </div>

        <div>
          <label htmlFor={`code-${event.id}`} className="font-display text-label font-extrabold tracking-[0.1em] text-ink-meta uppercase">
            Kode akses
          </label>
          <input
            id={`code-${event.id}`}
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            placeholder="kosongkan untuk terbuka"
            className="mt-2 w-full rounded-[var(--radius)] border-2 border-ink bg-elev px-3 py-2 text-small font-semibold text-ink outline-none focus:bg-butter"
          />
        </div>

        <div>
          <label htmlFor={`retention-${event.id}`} className="font-display text-label font-extrabold tracking-[0.1em] text-ink-meta uppercase">
            Retensi (jam)
          </label>
          <input
            id={`retention-${event.id}`}
            type="number"
            min={1}
            max={720}
            value={retention}
            onChange={(e) => setRetention(e.target.value)}
            className="mt-2 w-full rounded-[var(--radius)] border-2 border-ink bg-elev px-3 py-2 text-small font-semibold text-ink outline-none focus:bg-butter"
          />
        </div>
      </div>

      {error && <p className="mt-3 rounded-[var(--radius)] border-2 border-ink bg-pink px-3 py-2 text-small font-semibold text-ink">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy || title.trim().length === 0}
          className="pressable inline-flex items-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-mint px-5 py-2.5 font-display text-small font-bold text-ink shadow-lift-1 hover:bg-butter disabled:opacity-45"
        >
          <IconCheck size={18} stroke={2.5} aria-hidden="true" />
          Simpan
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setEditing(false);
          }}
          className="pressable inline-flex items-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-elev px-5 py-2.5 font-display text-small font-bold text-ink shadow-lift-1 hover:bg-sunken"
        >
          <IconX size={18} stroke={2.5} aria-hidden="true" />
          Batal
        </button>
      </div>
    </div>
  );
}
