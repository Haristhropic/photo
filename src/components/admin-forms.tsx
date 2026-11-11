"use client";

import {
  IconPlus,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

import {
  AdminNotice,
  BTN,
  CopyButton,
  FIELD,
  LABEL,
  eventLink,
} from "@/components/admin-ui";
import { adminRequest } from "@/lib/admin-api";
import {
  FRAME_CATEGORIES,
  FRAME_CATEGORY_LABEL,
  type FrameCategory,
} from "@/lib/frames";
import { LAYOUTS, LAYOUT_ORDER, type LayoutType } from "@/lib/layouts";

type CreatedEvent = {
  id: string;
  title: string;
  slug: string;
  accessCode: string | null;
  retentionHours: number;
};

/**
 * The three recurring jobs on the dashboard. Each panel owns its own result
 * message so a failure in one does not make the others look broken.
 */

export function CreateEventPanel({ onChanged }: { onChanged: () => void }) {
  const [title, setTitle] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [retention, setRetention] = useState("24");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedEvent | null>(null);

  async function submit(submitEvent: React.FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    setCreated(null);

    try {
      const data = await adminRequest<CreatedEvent>("/api/admin/events", {
        method: "POST",
        body: {
          title,
          accessCode: accessCode.trim() || null,
          retentionHours: Number(retention),
        },
      });

      setCreated(data);
      setTitle("");
      setAccessCode("");
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal membuat event");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <AdminNotice tone="error">{error}</AdminNotice>}

      {created && (
        <AdminNotice tone="success">
          <span className="block">
            Event <strong className="font-extrabold">{created.title}</strong>{" "}
            dibuat.
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[6px] border-2 border-ink bg-elev px-2 py-1 font-mono text-[0.78rem] font-bold text-ink">
              /e/{created.slug}
            </code>
            <CopyButton
              value={() => eventLink(created.slug)}
              label="Salin link"
              copiedLabel="Tersalin"
              className={BTN.quiet}
            />
          </span>
        </AdminNotice>
      )}

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <label htmlFor="create-event-title" className={LABEL}>
            Judul event
          </label>
          <input
            id="create-event-title"
            required
            maxLength={160}
            value={title}
            onChange={(changeEvent) => setTitle(changeEvent.target.value)}
            placeholder="Pernikahan Rani &amp; Dito"
            className={FIELD}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="create-event-code" className={LABEL}>
              Kode akses
            </label>
            <input
              id="create-event-code"
              maxLength={64}
              value={accessCode}
              onChange={(changeEvent) => setAccessCode(changeEvent.target.value)}
              placeholder="Opsional"
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="create-event-retention" className={LABEL}>
              Retensi (jam)
            </label>
            <input
              id="create-event-retention"
              type="number"
              min={1}
              max={720}
              required
              value={retention}
              onChange={(changeEvent) => setRetention(changeEvent.target.value)}
              className={FIELD}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={busy || title.trim().length === 0}
          className={BTN.primary}
        >
          <IconPlus size={18} stroke={2.5} aria-hidden="true" />
          {busy ? "Membuat..." : "Buat event"}
        </button>
      </form>
    </div>
  );
}

type EventOption = { id: string; title: string };

export function UploadFramePanel({
  events,
  onChanged,
}: {
  events: EventOption[];
  onChanged: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [layoutType, setLayoutType] = useState<LayoutType>("STRIP_3");
  const [category, setCategory] = useState<FrameCategory>("cool");
  const [eventId, setEventId] = useState("");
  const [inputKey, setInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const preview = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pick(nextFile: File | null) {
    setFile(nextFile);
    setSaved(null);
    setError(null);
    if (nextFile && name.trim().length === 0) {
      setName(nextFile.name.replace(/\.png$/i, ""));
    }
  }

  async function submit(submitEvent: React.FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    if (!file || busy) return;

    setBusy(true);
    setError(null);
    setSaved(null);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("name", name.trim() || file.name.replace(/\.png$/i, ""));
      form.append("layoutType", layoutType);
      form.append("category", category);
      if (eventId) form.append("eventId", eventId);

      const data = await adminRequest<{ name: string }>("/api/admin/frames", {
        method: "POST",
        form,
      });

      setSaved(data.name);
      setFile(null);
      setName("");
      setInputKey((key) => key + 1);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal mengunggah frame");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <AdminNotice tone="error">{error}</AdminNotice>}

      {saved && (
        <AdminNotice tone="success">
          Frame <strong className="font-extrabold">{saved}</strong> tersimpan.
        </AdminNotice>
      )}

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <span id="upload-frame-file-label" className={LABEL}>
            File PNG
          </span>
          <div className="mt-1.5 flex items-center gap-2 rounded-[var(--radius-sm)] border-2 border-ink bg-elev p-1.5 focus-within:bg-butter focus-within:outline-3 focus-within:outline-offset-3 focus-within:outline-sky">
            <label
              htmlFor="upload-frame-file"
              className="pressable inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-[6px] border-2 border-ink bg-butter px-3 font-display text-small font-extrabold text-ink"
            >
              <IconUpload size={16} stroke={2.5} aria-hidden="true" />
              Pilih PNG
            </label>
            <span className="min-w-0 truncate text-small font-semibold text-ink-body">
              {file ? file.name : "Belum ada file"}
            </span>
          </div>
          <input
            key={inputKey}
            id="upload-frame-file"
            type="file"
            accept="image/png"
            aria-labelledby="upload-frame-file-label"
            onChange={(changeEvent) =>
              pick(changeEvent.target.files?.[0] ?? null)
            }
            className="sr-only"
          />
        </div>

        {preview && (
          <div className="grid place-items-center rounded-[var(--radius-sm)] border-2 border-ink bg-sunken p-3">
            <img
              src={preview}
              alt="Pratinjau frame yang akan diunggah"
              width={240}
              height={240}
              className="max-h-32 w-auto max-w-full object-contain"
            />
          </div>
        )}

        <div>
          <label htmlFor="upload-frame-name" className={LABEL}>
            Nama
          </label>
          <input
            id="upload-frame-name"
            maxLength={120}
            value={name}
            onChange={(changeEvent) => setName(changeEvent.target.value)}
            placeholder="Nama frame"
            className={FIELD}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="upload-frame-layout" className={LABEL}>
              Layout
            </label>
            <select
              id="upload-frame-layout"
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
            <label htmlFor="upload-frame-category" className={LABEL}>
              Kategori
            </label>
            <select
              id="upload-frame-category"
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
          <label htmlFor="upload-frame-event" className={LABEL}>
            Event
          </label>
          <select
            id="upload-frame-event"
            value={eventId}
            onChange={(changeEvent) => setEventId(changeEvent.target.value)}
            className={FIELD}
          >
            <option value="">Tanpa event (global)</option>
            {events.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={busy || !file}
            className={`${BTN.primary} flex-1`}
          >
            <IconUpload size={18} stroke={2.5} aria-hidden="true" />
            {busy ? "Mengunggah..." : "Unggah frame"}
          </button>
        </div>

        <p className="text-small font-semibold text-meta">
          PNG transparan. Jendela foto dideteksi otomatis, file disimpan ke
          Cloudinary.
        </p>
      </form>
    </div>
  );
}

type CleanupResult = {
  sessionsRemoved: number;
  filesRemoved: number;
  cloudinaryRemoved: number;
  cloudinaryFailed: number;
  publishedKept: number;
};

export function MaintenancePanel({ onChanged }: { onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CleanupResult | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const data = await adminRequest<CleanupResult>("/api/cron/cleanup", {
        method: "POST",
      });
      setResult(data);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pembersihan gagal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <AdminNotice tone="error">{error}</AdminNotice>}

      {result && (
        <AdminNotice tone={result.cloudinaryFailed > 0 ? "info" : "success"}>
          <span className="block">
            {result.sessionsRemoved} sesi dihapus, {result.filesRemoved} file
            lokal dibersihkan, {result.cloudinaryRemoved} aset Cloudinary
            dihapus.
          </span>
          {result.cloudinaryFailed > 0 && (
            <span className="mt-1 block">
              {result.cloudinaryFailed} aset gagal dihapus dan akan dicoba lagi.
            </span>
          )}
          {result.publishedKept > 0 && (
            <span className="mt-1 block">
              {result.publishedKept} foto tetap disimpan karena masih tampil di
              galeri publik.
            </span>
          )}
        </AdminNotice>
      )}

      <p className="text-small font-semibold text-ink-body">
        Hapus sesi yang sudah lewat masa retensi beserta file lokal dan aset
        Cloudinary-nya. Foto yang masih tampil di galeri publik sengaja
        dipertahankan.
      </p>

      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={BTN.danger}
      >
        <IconTrash size={17} stroke={2.5} aria-hidden="true" />
        {busy ? "Membersihkan..." : "Jalankan retensi"}
      </button>
    </div>
  );
}
