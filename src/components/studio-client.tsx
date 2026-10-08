"use client";

import {
  IconArrowLeft,
  IconCheck,
  IconRefresh,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import {
  clearDraft,
  getDraftSnapshot,
  subscribeDraft,
} from "@/lib/draft-store";
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
import { Logo } from "@/components/logo";

export function StudioClient() {
  const router = useRouter();
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const draft = useSyncExternalStore(
    subscribeDraft,
    getDraftSnapshot,
    () => null,
  );
  const [filterKey, setFilterKey] = useState<FilterKey>("original");
  const [sticker, setSticker] = useState<StickerKey | null>("snapvibe");
  // The rendered strip is stored together with the exact inputs it came from.
  // Validity is derived rather than cleared on every change, so a preview for a
  // superseded draft, filter or sticker is simply not readable and can never be
  // uploaded against inputs the guest has already moved on from.
  const [rendered, setRendered] = useState<{
    draft: Draft;
    filterKey: FilterKey;
    sticker: StickerKey | null;
    dataUrl: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publish, setPublish] = useState(false);
  const [publishNotice, setPublishNotice] = useState<string | null>(null);

  const preview =
    rendered &&
    rendered.draft === draft &&
    rendered.filterKey === filterKey &&
    rendered.sticker === sticker
      ? rendered.dataUrl
      : null;

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
        if (cancelled) return;
        setRendered({ draft, filterKey, sticker, dataUrl });
      })
      .catch(() => {
        if (cancelled) return;
        setError("Pratinjau tidak bisa dirender.");
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
          publish,
        }),
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error ?? "Foto gagal disimpan");
      }

      const data = (await response.json()) as {
        accessKey: string;
        published: boolean;
      };
      // The guest asked for the gallery, so say so plainly when Cloudinary
      // rejected the upload. The photo itself is saved either way.
      if (publish && !data.published) {
        setPublishNotice(
          "Fotomu tersimpan, tapi gagal masuk galeri publik. Coba lagi nanti.",
        );
      }
      clearDraft();
      // The draft is already cleared, so /studio must not stay in history or
      // Back lands on an empty studio. replace keeps Back pointing at /booth.
      router.replace(`/p/${data.accessKey}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Foto gagal disimpan");
      setSaving(false);
    }
  }, [draft, preview, saving, filterKey, publish, router]);

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
        <div className="max-w-[var(--measure)] rounded-[var(--radius-xl)] border-2 border-ink bg-elev p-8 shadow-lift-2">
          <h1 className="font-display text-h2 font-extrabold text-ink">
            Belum ada foto
          </h1>
          <p className="mt-3 text-lead text-ink-body">
            Studio hanya bisa dibuka setelah kamu mengambil foto di booth.
          </p>
          <button
            type="button"
            onClick={() => router.push("/booth?from=studio")}
            className="pressable mt-8 inline-flex items-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-mint px-7 py-4 font-display text-lead font-extrabold text-ink shadow-lift-2 hover:bg-sky"
          >
            <IconArrowLeft size={22} stroke={2.5} aria-hidden="true" />
            Buka booth
          </button>
        </div>
      </main>
    );
  }

  const layout = LAYOUTS[draft.layoutType];

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b-2 border-ink">
        <div className="shell flex h-18 items-center justify-between gap-3 py-2">
          <Link
            href="/"
            aria-label="SnapVibe, kembali ke beranda"
            className="font-display text-h3 font-extrabold"
          >
            <Logo className="h-12 w-auto" />
          </Link>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => router.push("/booth?from=studio")}
              aria-label="Kembali ke booth"
              className="pressable inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-pill)] border-2 border-ink bg-elev px-3.5 py-1.5 font-display text-label font-bold tracking-[0.1em] text-ink uppercase shadow-lift-1"
            >
              <IconArrowLeft size={18} stroke={2.5} aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Booth</span>
            </button>
            <span className="hidden rounded-[var(--radius-pill)] border-2 border-ink bg-butter px-4 py-1.5 font-display text-label font-extrabold tracking-[0.12em] text-ink uppercase sm:inline-flex">
              Studio
            </span>
            <span className="min-w-0 truncate rounded-[var(--radius-pill)] border-2 border-ink bg-mint px-4 py-1.5 font-display text-label font-bold tracking-[0.12em] text-ink uppercase">
              {layout.label}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="shell grid gap-10 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <div
            className="rounded-[var(--radius-xl)] border-2 border-ink bg-ink p-3 shadow-lift-3"
            style={{ transform: "rotate(-0.7deg)" }}
          >
            {preview ? (
              <img
                src={preview}
                alt="Pratinjau strip foto"
                className="mx-auto max-h-[70vh] w-auto rounded-[6px]"
              />
            ) : (
              <div className="grid aspect-3/4 place-items-center rounded-[6px] bg-sunken text-ink-meta">
                <span className="font-display text-label font-bold tracking-[0.14em] uppercase">
                  Merender
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-8">
            <fieldset>
              <legend className="font-display text-label font-extrabold tracking-[0.12em] text-ink uppercase">
                Filter
              </legend>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {FILTER_ORDER.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilterKey(key)}
                    aria-pressed={key === filterKey}
                    className={`pressable rounded-[var(--radius)] border-2 px-3 py-3 font-display text-small font-bold ${
                      key === filterKey
                        ? "border-ink bg-butter text-ink shadow-lift-1"
                        : "border-ink bg-elev text-ink-body shadow-lift-1 hover:bg-sunken"
                    }`}
                  >
                    {FILTERS[key].label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="font-display text-label font-extrabold tracking-[0.12em] text-ink uppercase">
                Stiker
              </legend>
              <div className="mt-3 grid grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={() => setSticker(null)}
                  aria-pressed={sticker === null}
                  className={`pressable rounded-[var(--radius)] border-2 px-3 py-3 font-display text-small font-bold ${
                    sticker === null
                      ? "border-ink bg-butter text-ink shadow-lift-1"
                      : "border-ink bg-elev text-ink-body shadow-lift-1 hover:bg-sunken"
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
                    className={`pressable rounded-[var(--radius)] border-2 px-3 py-3 font-display text-label font-extrabold tracking-[0.1em] uppercase ${
                      key === sticker
                        ? "border-ink bg-pink text-ink shadow-lift-1"
                        : "border-ink bg-elev text-ink-body shadow-lift-1 hover:bg-sunken"
                    }`}
                  >
                    {STICKER_TEXT[key]}
                  </button>
                ))}
              </div>
            </fieldset>

            {error && (
              <p className="rounded-[var(--radius)] border-2 border-ink bg-pink px-4 py-3 text-small font-semibold text-ink">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={save}
                disabled={!preview || saving}
                className="pressable inline-flex items-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-pink px-7 py-4 font-display text-lead font-extrabold text-ink shadow-lift-2 hover:bg-[var(--mix-coral)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saving ? (
                  "Menyimpan..."
                ) : (
                  <>
                    <IconCheck size={22} stroke={2.5} aria-hidden="true" />
                    Simpan dan buat QR
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => router.push("/booth?from=studio")}
                className="pressable inline-flex items-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-elev px-7 py-4 font-display text-lead font-bold text-ink shadow-lift-2 hover:bg-butter"
              >
                <IconRefresh size={22} stroke={2.5} aria-hidden="true" />
                Ambil ulang
              </button>
            </div>

            {publishNotice && (
              <p
                role="status"
                className="rounded-[var(--radius)] border-2 border-ink bg-butter p-4 text-small font-bold text-ink"
              >
                {publishNotice}
              </p>
            )}

            <label className="pressable relative flex cursor-pointer items-start rounded-[var(--radius-lg)] border-2 border-ink bg-sunken p-4 pl-17 text-ink shadow-lift-1 has-[:checked]:bg-butter has-[:checked]:text-on-butter">
              <input
                type="checkbox"
                checked={publish}
                onChange={(event) => setPublish(event.target.checked)}
                className="peer absolute left-4 top-4 size-9 cursor-pointer appearance-none rounded-[var(--radius-sm)] border-2 border-ink bg-elev checked:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
              />
              <IconCheck
                size={22}
                stroke={3.5}
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-4 size-9 p-[7px] text-bg opacity-0 transition-opacity peer-checked:opacity-100"
              />
              <span className="flex flex-col gap-1">
                <span className="font-display text-label font-extrabold tracking-[0.1em] uppercase">
                  Tampilkan di galeri publik
                </span>
                <span className="text-small opacity-80">
                  Centang untuk mengunggah foto ini ke Cloudinary supaya
                  bisa dilihat semua orang di galeri SnapVibe. Biarkan
                  kosong kalau fotomu hanya untukmu.
                </span>
              </span>
            </label>

            <p className="font-display text-label font-bold tracking-[0.12em] text-ink-meta uppercase">
              {draft.shots.length} bidikan / {layout.canvas.w} x {layout.canvas.h}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
