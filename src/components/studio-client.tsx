"use client";

import {
  IconArrowLeft,
  IconCheck,
  IconDownload,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import {
  FILTERS,
  FILTER_ORDER,
  LAYOUTS,
  STICKER_KEYS,
  STICKER_TEXT,
  type FilterKey,
  type StickerKey,
} from "@/lib/layouts";
import { renderStrip, type Draft } from "@/lib/render";

const DRAFT_KEY = "snapvibe.draft";

// useSyncExternalStore requires a referentially stable snapshot, so the parsed
// draft is cached rather than re-parsed on every render.
let cachedDraft: Draft | null | undefined;

function readDraft(): Draft | null {
  if (cachedDraft !== undefined) return cachedDraft;

  const raw = sessionStorage.getItem(DRAFT_KEY);
  if (!raw) {
    cachedDraft = null;
    return cachedDraft;
  }

  try {
    const parsed = JSON.parse(raw) as Draft;
    cachedDraft =
      Array.isArray(parsed.shots) && parsed.shots.length > 0 ? parsed : null;
  } catch {
    sessionStorage.removeItem(DRAFT_KEY);
    cachedDraft = null;
  }
  return cachedDraft;
}

function clearDraft() {
  cachedDraft = undefined;
  sessionStorage.removeItem(DRAFT_KEY);
}

export function StudioClient() {
  const router = useRouter();
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const draft = useSyncExternalStore(
    () => () => undefined,
    readDraft,
    () => null,
  );
  const [filterKey, setFilterKey] = useState<FilterKey>("original");
  const [sticker, setSticker] = useState<StickerKey | null>("snapvibe");
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!draft) return;
    let cancelled = false;
    renderStrip({
      shots: draft.shots,
      layoutType: draft.layoutType,
      filterKey,
      sticker,
      eventLabel: null,
    })
      .then((dataUrl) => {
        if (!cancelled) setPreview(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setError("Pratinjau tidak bisa dirender.");
      });
    return () => {
      cancelled = true;
    };
  }, [draft, filterKey, sticker]);

  const save = useCallback(async () => {
    if (!draft || !preview || saving) return;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: preview,
          layoutType: draft.layoutType,
          filterKey,
          eventId: draft.eventId,
        }),
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error ?? "Foto gagal disimpan");
      }

      const data = (await response.json()) as { accessKey: string };
      clearDraft();
      router.push(`/p/${data.accessKey}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Foto gagal disimpan");
      setSaving(false);
    }
  }, [draft, preview, saving, filterKey, router]);

  if (!hydrated) {
    return (
      <main className="shell flex flex-1 flex-col justify-center py-[var(--section)]">
        <p className="text-lead text-ink-body">Menyiapkan studio...</p>
      </main>
    );
  }

  if (!draft) {
    return (
      <main className="shell flex flex-1 flex-col justify-center py-[var(--section)]">
        <div className="max-w-[var(--measure)] border border-line bg-elev p-8">
          <h1 className="text-h2 font-semibold">Belum ada foto</h1>
          <p className="mt-3 text-lead text-ink-body">
            Studio hanya bisa dibuka setelah kamu mengambil foto di booth.
          </p>
          <button
            type="button"
            onClick={() => router.push("/booth")}
            className="mt-8 inline-flex items-center gap-2 border border-accent bg-accent px-6 py-3 text-body font-medium text-on-accent transition-colors duration-150 hover:bg-accent-hover"
          >
            <IconArrowLeft size={20} stroke={1.75} aria-hidden="true" />
            Buka booth
          </button>
        </div>
      </main>
    );
  }

  const layout = LAYOUTS[draft.layoutType];

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line">
        <div className="shell flex h-16 items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/booth")}
            className="inline-flex items-center gap-2 font-mono text-label tracking-[0.16em] uppercase text-meta transition-colors hover:text-accent"
          >
            <IconArrowLeft size={18} stroke={1.75} aria-hidden="true" />
            Booth
          </button>
          <span className="font-mono text-label font-semibold tracking-[0.16em] uppercase">
            Studio
          </span>
          <span className="font-mono text-label tracking-[0.16em] uppercase text-meta">
            {layout.label}
          </span>
        </div>
      </header>

      <main className="flex-1">
        <div className="shell grid gap-10 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <div className="border border-line bg-sunken p-4">
            {preview ? (
              <img
                src={preview}
                alt="Pratinjau strip foto"
                className="mx-auto max-h-[70vh] w-auto border border-line"
              />
            ) : (
              <div className="grid aspect-3/4 place-items-center border border-line text-meta">
                <span className="font-mono text-label tracking-[0.16em] uppercase">
                  Merender
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-8">
            <fieldset>
              <legend className="label">Filter</legend>
              <div className="mt-3 grid grid-cols-3 gap-px border border-line bg-line">
                {FILTER_ORDER.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilterKey(key)}
                    aria-pressed={key === filterKey}
                    className={`px-3 py-3 text-small transition-colors ${
                      key === filterKey
                        ? "bg-wash font-medium text-accent"
                        : "bg-elev text-ink-body hover:bg-sunken"
                    }`}
                  >
                    {FILTERS[key].label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="label">Stiker</legend>
              <div className="mt-3 grid grid-cols-4 gap-px border border-line bg-line">
                <button
                  type="button"
                  onClick={() => setSticker(null)}
                  aria-pressed={sticker === null}
                  className={`px-3 py-3 text-small transition-colors ${
                    sticker === null
                      ? "bg-wash font-medium text-accent"
                      : "bg-elev text-ink-body hover:bg-sunken"
                  }`}
                >
                  Tanpa
                </button>
                {STICKER_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSticker(key)}
                    aria-pressed={key === sticker}
                    className={`px-3 py-3 font-mono text-label tracking-[0.16em] uppercase transition-colors ${
                      key === sticker
                        ? "bg-wash font-semibold text-accent"
                        : "bg-elev text-ink-body hover:bg-sunken"
                    }`}
                  >
                    {STICKER_TEXT[key]}
                  </button>
                ))}
              </div>
            </fieldset>

            {error && (
              <p className="border border-line bg-elev p-4 text-small text-ink">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={save}
                disabled={!preview || saving}
                className="inline-flex items-center gap-2 border border-accent bg-accent px-6 py-3 text-body font-medium text-on-accent transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  "Menyimpan..."
                ) : (
                  <>
                    <IconCheck size={20} stroke={1.75} aria-hidden="true" />
                    Simpan dan buat QR
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => router.push("/booth")}
                className="inline-flex items-center gap-2 border border-line-strong px-6 py-3 text-body font-medium text-ink transition-colors duration-150 hover:border-ink"
              >
                <IconDownload size={20} stroke={1.75} aria-hidden="true" />
                Ambil ulang
              </button>
            </div>

            <p className="font-mono text-label tracking-[0.16em] uppercase text-meta">
              {draft.shots.length} bidikan / {layout.canvas.w} x {layout.canvas.h}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
