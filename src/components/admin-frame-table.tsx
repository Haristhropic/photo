"use client";

import { IconCheck, IconPencil, IconTrash, IconX } from "@tabler/icons-react";
import { useState } from "react";

import { adminRequest } from "@/lib/admin-api";
import { LAYOUTS, LAYOUT_ORDER, type LayoutType } from "@/lib/layouts";

export type FrameRow = {
  id: string;
  name: string;
  imageUrl: string;
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
  if (frames.length === 0) {
    return (
      <p className="bg-elev p-6 text-ink-body">
        Belum ada frame. Unggah PNG transparan di atas.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {frames.map((frame) => (
        <FrameItem
          key={frame.id}
          frame={frame}
          eventOptions={eventOptions}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

function FrameItem({
  frame,
  eventOptions,
  onChanged,
}: {
  frame: FrameRow;
  eventOptions: EventOption[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(frame.name);
  const [layoutType, setLayoutType] = useState<LayoutType>(
    (frame.layoutType as LayoutType) ?? "STRIP_3",
  );
  const [eventId, setEventId] = useState(frame.eventId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName(frame.name);
    setLayoutType((frame.layoutType as LayoutType) ?? "STRIP_3");
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
        body: { name, layoutType, eventId: eventId || null },
      });
      setEditing(false);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal menyimpan frame");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const confirmed = window.confirm(
      `Hapus frame "${frame.name}"? File PNG akan dihapus permanen.`,
    );
    if (!confirmed || busy) return;

    setBusy(true);
    setError(null);

    try {
      await adminRequest(`/api/admin/frames/${frame.id}`, { method: "DELETE" });
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal menghapus frame");
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] border-2 border-ink bg-elev p-6 shadow-lift-1">
        <div className="flex min-w-0 items-center gap-4">
          <img
            src={frame.imageUrl}
            alt={`Frame ${frame.name}`}
            className="size-16 shrink-0 rounded-[var(--radius)] border-2 border-ink bg-butter object-contain"
          />
          <div className="min-w-0">
            <p className="font-display text-h3 font-extrabold">{frame.name}</p>
            <p className="mt-1 font-display text-label font-bold tracking-[0.08em] text-ink-meta">
              {LAYOUTS[layoutType]?.label ?? frame.layoutType} /{" "}
              {frame.eventTitle ?? "tanpa event"}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              reset();
              setEditing(true);
            }}
            aria-label={`Ubah frame ${frame.name}`}
            className="pressable inline-flex size-11 items-center justify-center rounded-[var(--radius)] border-2 border-ink bg-elev text-ink shadow-lift-1 hover:bg-butter"
          >
            <IconPencil size={18} stroke={2.5} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            aria-label={`Hapus frame ${frame.name}`}
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
      <div className="flex flex-wrap items-start gap-4">
        <img
          src={frame.imageUrl}
          alt={`Frame ${frame.name}`}
          className="size-20 shrink-0 rounded-[var(--radius)] border-2 border-ink bg-butter object-contain"
        />

        <div className="grid flex-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor={`frame-name-${frame.id}`} className="font-display text-label font-extrabold tracking-[0.1em] text-ink-meta uppercase">
              Nama
            </label>
            <input
              id={`frame-name-${frame.id}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-2 w-full rounded-[var(--radius)] border-2 border-ink bg-elev px-3 py-2 text-small font-semibold text-ink outline-none focus:bg-butter"
            />
          </div>

          <div>
            <label htmlFor={`frame-layout-${frame.id}`} className="font-display text-label font-extrabold tracking-[0.1em] text-ink-meta uppercase">
              Layout
            </label>
            <select
              id={`frame-layout-${frame.id}`}
              value={layoutType}
              onChange={(e) => setLayoutType(e.target.value as LayoutType)}
              className="mt-2 w-full rounded-[var(--radius)] border-2 border-ink bg-elev px-3 py-2 text-small font-semibold text-ink outline-none focus:bg-butter"
            >
              {LAYOUT_ORDER.map((key) => (
                <option key={key} value={key}>
                  {LAYOUTS[key].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`frame-event-${frame.id}`} className="font-display text-label font-extrabold tracking-[0.1em] text-ink-meta uppercase">
              Event
            </label>
            <select
              id={`frame-event-${frame.id}`}
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              className="mt-2 w-full rounded-[var(--radius)] border-2 border-ink bg-elev px-3 py-2 text-small font-semibold text-ink outline-none focus:bg-butter"
            >
              <option value="">Tanpa event</option>
              {eventOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && <p className="mt-3 rounded-[var(--radius)] border-2 border-ink bg-pink px-3 py-2 text-small font-semibold text-ink">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy || name.trim().length === 0}
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
