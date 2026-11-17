"use client";

import { IconTrash, IconUpload } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

import { AdminNotice, BTN, FIELD, LABEL } from "@/components/admin-ui";
import { adminRequest } from "@/lib/admin-api";
import {
  FRAME_CATEGORIES,
  FRAME_CATEGORY_LABEL,
  type FrameCategory,
} from "@/lib/frames";
import { LAYOUTS, LAYOUT_ORDER, type LayoutType } from "@/lib/layouts";

/**
 * The two recurring jobs on the dashboard. Each panel owns its own result
 * message so a failure in one does not make the other look broken.
 */

export function UploadFramePanel({ onChanged }: { onChanged: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [layoutType, setLayoutType] = useState<LayoutType>("STRIP_3");
  const [category, setCategory] = useState<FrameCategory>("cool");
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
          <div className="mt-1.5 flex flex-col gap-2 rounded-[var(--radius-sm)] border-2 border-ink bg-elev p-1.5 focus-within:bg-butter focus-within:outline-3 focus-within:outline-offset-3 focus-within:outline-sky min-[400px]:flex-row min-[400px]:items-center">
            <label
              htmlFor="upload-frame-file"
              className="pressable inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 self-start rounded-[6px] border-2 border-ink bg-butter px-3 font-display text-small font-extrabold text-ink"
            >
              <IconUpload size={16} stroke={2.5} aria-hidden="true" />
              Pilih PNG
            </label>
            <span className="min-w-0 truncate text-small font-semibold text-ink-body min-[400px]:flex-1">
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
        Hapus sesi yang sudah kedaluwarsa (24 jam) beserta file lokal dan aset
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
