"use client";

import {
  IconArrowBackUp,
  IconArrowLeft,
  IconCheck,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
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
  type FilterKey,
} from "@/lib/layouts";
import { renderStrip, type Draft } from "@/lib/render";
import {
  STICKERS,
  STICKER_KEYS,
  type StickerKey,
} from "@/lib/stickers";
import {
  builtInFrames,
  dynamicFramePreset,
  filterFrames,
  FRAME_CATEGORIES,
  FRAME_CATEGORY_LABEL,
  frameSupportsLayout,
  type DynamicFrameRecord,
  type FrameCategory,
  type FrameKey,
  type FramePreset,
} from "@/lib/frames";
import { BackLink } from "@/components/back-link";
import { FrameSwatch } from "@/components/frame-swatch";
import { StickerSwatch } from "@/components/sticker-swatch";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";

// Send the rendered PNG as raw bytes instead of a base64 JSON string. Vercel
// caps a serverless request body at 4.5 MB, and base64 adds ~33% overhead.
function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const metadata = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const mime = /^data:([^;]+)/.exec(metadata)?.[1] ?? "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function StickerOption({
  stickerKey,
  selected,
  onSelect,
}: {
  stickerKey: StickerKey | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const preset = stickerKey ? STICKERS[stickerKey] : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={
        preset
          ? `${preset.name} — ${preset.blurb}`
          : "Tanpa stiker, strip tetap bersih"
      }
      className={`pressable flex flex-col gap-1.5 rounded-[14px] border-2 border-ink p-1.5 text-left shadow-lift-1 ${
        selected ? "bg-butter" : "bg-elev hover:bg-sunken"
      }`}
    >
      <StickerSwatch stickerKey={stickerKey} />
      <span className="block truncate px-0.5 font-display text-label font-extrabold tracking-[0.04em] text-ink uppercase">
        {preset ? preset.name : "Tanpa"}
      </span>
    </button>
  );
}

function FrameOption({
  frame,
  selected,
  onSelect,
}: {
  frame: FramePreset | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const preset = frame;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={
        preset
          ? `${preset.name} — ${preset.blurb}`
          : "Tanpa frame, cuma kertas putih"
      }
      className={`pressable flex flex-col gap-1.5 rounded-[14px] border-2 border-ink p-1.5 text-left shadow-lift-1 ${
        selected ? "bg-butter" : "bg-elev hover:bg-sunken"
      }`}
    >
      <FrameSwatch frame={frame} />
      <span className="block truncate px-0.5 font-display text-label font-extrabold tracking-[0.04em] text-ink uppercase">
        {preset ? preset.name : "Tanpa"}
      </span>
    </button>
  );
}

/**
 * Decode a freshly rendered strip before putting it in the preview <img>.
 * The old preview stays visible while this runs, so swapping images cannot
 * flash an empty box. A decode failure is ignored; the image element will
 * report it through the normal error path.
 */
function decodePreview(dataUrl: string): Promise<void> {
  const image = new Image();
  if (typeof image.decode === "function") {
    image.src = dataUrl;
    return image.decode().catch(() => undefined);
  }
  return new Promise((resolve) => {
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = dataUrl;
  });
}

function StudioHeader({
  layoutLabel,
  back = { href: "/booth?from=studio", label: "Booth" },
}: {
  layoutLabel?: string;
  back?: { href: string; label: string };
}) {
  return (
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
          <BackLink href={back.href} label={back.label} />
          <span className="hidden rounded-[var(--radius-pill)] border-2 border-ink bg-butter px-4 py-1.5 font-display text-label font-extrabold tracking-[0.12em] text-ink uppercase sm:inline-flex">
            Studio
          </span>
          {layoutLabel && (
            <span className="min-w-0 truncate rounded-[var(--radius-pill)] border-2 border-ink bg-mint px-4 py-1.5 font-display text-label font-bold tracking-[0.12em] text-ink uppercase">
              {layoutLabel}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

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
  const [sticker, setSticker] = useState<StickerKey | null>("senyum");
  const [frameKey, setFrameKey] = useState<FrameKey | null>(null);
  const [frameCategory, setFrameCategory] = useState<FrameCategory | "all">(
    "all",
  );
  const [dynamicFrames, setDynamicFrames] = useState<FramePreset[]>([]);
  const [loadedEventId, setLoadedEventId] = useState<
    string | null | undefined
  >(undefined);
  const [framesError, setFramesError] = useState<string | null>(null);
  // The rendered strip is stored together with the exact inputs it came from.
  // Validity is derived rather than cleared on every change, so a preview for a
  // superseded draft, filter, sticker or frame is simply not readable and can
  // never be uploaded against inputs the guest has already moved on from.
  const [rendered, setRendered] = useState<{
    draft: Draft;
    filterKey: FilterKey;
    sticker: StickerKey | null;
    frameKey: FrameKey | null;
    frameName: string | null;
    dataUrl: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publish, setPublish] = useState(false);
  const [publishNotice, setPublishNotice] = useState<string | null>(null);

  const builtIn = useMemo(() => builtInFrames(), []);
  const eventId = draft?.eventId ?? null;
  // Derived rather than synchronously set in the effect; the previous frames
  // stay visible while the next event's catalogue loads.
  const framesLoading = loadedEventId !== eventId;

  // Admin-managed frames live in Neon and their artwork in Cloudinary, so the
  // catalogue is fetched for the event the draft belongs to. Global frames
  // (eventId null) are always included by the API.
  useEffect(() => {
    const controller = new AbortController();

    const query = eventId ? `?eventId=${encodeURIComponent(eventId)}` : "";
    fetch(`/api/frames${query}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as
          | { frames?: DynamicFrameRecord[]; error?: string }
          | null;
        if (!response.ok) {
          throw new Error(data?.error ?? "Frame event gagal dimuat");
        }
        return data?.frames ?? [];
      })
      .then((rows) => {
        if (controller.signal.aborted) return;
        setDynamicFrames(rows.map(dynamicFramePreset));
        setFramesError(null);
        setLoadedEventId(eventId);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setFramesError(
          cause instanceof Error ? cause.message : "Frame event gagal dimuat",
        );
        setLoadedEventId(eventId);
      });

    return () => controller.abort();
  }, [eventId]);

  const allFrames = useMemo(
    () => [...builtIn, ...dynamicFrames],
    [builtIn, dynamicFrames],
  );
  const frameMap = useMemo(
    () => new Map(allFrames.map((frame) => [frame.key, frame])),
    [allFrames],
  );
  const requestedFrame = frameKey ? frameMap.get(frameKey) ?? null : null;

  // Bitmap event frames are designed for one layout. Derive the usable frame so
  // the preview, label and picker all ignore an invalid choice when a different
  // draft layout arrives, without a state-resetting effect.
  const activeFrame =
    requestedFrame &&
    draft &&
    frameSupportsLayout(requestedFrame, draft.layoutType)
      ? requestedFrame
      : null;

  // Keep the last render for this draft on screen while the next one paints.
  // A sticker/filter/frame change should swap the image in place, not replace
  // it with the "Merender" box and make the whole studio jump.
  const renderedForDraft =
    rendered && rendered.draft === draft ? rendered : null;
  const preview =
    renderedForDraft &&
    renderedForDraft.filterKey === filterKey &&
    renderedForDraft.sticker === sticker &&
    renderedForDraft.frameKey === (activeFrame?.key ?? null)
      ? renderedForDraft.dataUrl
      : null;
  const shownPreview = preview ?? renderedForDraft?.dataUrl ?? null;
  const shownSticker = preview
    ? sticker
    : (renderedForDraft?.sticker ?? null);
  const shownFrameName = preview
    ? (activeFrame?.name ?? null)
    : (renderedForDraft?.frameName ?? null);

  useEffect(() => {
    if (!draft) return;
    let cancelled = false;

    renderStrip({
      shots: draft.shots,
      layoutType: draft.layoutType,
      filterKey,
      sticker,
      frame: activeFrame,
      eventLabel: null,
    })
      .then(async (dataUrl) => {
        if (cancelled) return;
        await decodePreview(dataUrl);
        if (cancelled) return;
        setRendered({
          draft,
          filterKey,
          sticker,
          frameKey: activeFrame?.key ?? null,
          frameName: activeFrame?.name ?? null,
          dataUrl,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setError("Pratinjau tidak bisa dirender.");
      });
    return () => {
      cancelled = true;
    };
  }, [draft, filterKey, sticker, activeFrame]);

  const save = useCallback(async () => {
    if (!draft || !preview || saving) return;
    setSaving(true);
    setError(null);

    try {
      const imageBlob = dataUrlToBlob(preview);
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": imageBlob.type || "image/png",
          "X-Layout-Type": draft.layoutType,
          "X-Filter-Key": filterKey,
          "X-Publish": publish ? "true" : "false",
          ...(draft.eventId ? { "X-Event-Id": draft.eventId } : {}),
        },
        body: imageBlob,
      });

      if (!response.ok) {
        if (response.status === 413) {
          throw new Error(
            "Fotonya terlalu besar untuk diunggah. Coba layout atau frame yang lebih ringan.",
          );
        }
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
      <div className="flex flex-1 flex-col">
        <StudioHeader back={{ href: "/", label: "Beranda" }} />
        <main className="shell flex flex-1 flex-col justify-center py-[var(--page)]">
          <h1 className="sr-only">Studio foto</h1>
          <p className="text-lead text-ink-body">Menyiapkan studio...</p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="flex flex-1 flex-col">
        <StudioHeader back={{ href: "/", label: "Beranda" }} />
        <main className="shell flex flex-1 flex-col justify-center py-[var(--page)]">
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
        <SiteFooter />
      </div>
    );
  }

  const layout = LAYOUTS[draft.layoutType];
  const visibleFrames = filterFrames(
    allFrames,
    frameCategory,
    draft.layoutType,
  );
  const hasHiddenDynamicFrames = dynamicFrames.some(
    (frame) => !frameSupportsLayout(frame, draft.layoutType),
  );
  const frameGridClass =
    (1 + visibleFrames.length) % 3 === 1
      ? "max-sm:[&>button:last-child]:col-start-2"
      : "";

  return (
    <div className="flex flex-1 flex-col">
      <StudioHeader layoutLabel={layout.label} />

      <main className="flex-1">
        <h1 className="sr-only">Studio foto</h1>
        <div className="shell grid gap-10 py-[var(--page)] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start">
          <div
            className="w-full min-w-0 justify-self-center rounded-[var(--radius-xl)] border-2 border-ink bg-ink p-3 shadow-lift-3 lg:justify-self-end"
            style={{
              transform: "rotate(-0.7deg)",
              maxWidth: `calc(${(70 * layout.canvas.w) / layout.canvas.h}vh + 1.5rem)`,
            }}
          >
            {shownPreview ? (
              <img
                src={shownPreview}
                width={layout.canvas.w}
                height={layout.canvas.h}
                alt={`Pratinjau strip foto${
                  shownSticker ? ` dengan stiker ${STICKERS[shownSticker].name}` : ""
                }${shownFrameName ? ` dan frame ${shownFrameName}` : ""}`}
                aria-busy={!preview}
                className="mx-auto h-auto max-h-[70vh] w-auto max-w-full rounded-[6px]"
              />
            ) : (
              <div
                className="mx-auto grid w-full place-items-center rounded-[6px] bg-sunken text-ink-meta"
                style={{
                  aspectRatio: `${layout.canvas.w} / ${layout.canvas.h}`,
                  maxWidth: `${(70 * layout.canvas.w) / layout.canvas.h}vh`,
                }}
              >
                <span className="font-display text-label font-bold tracking-[0.14em] uppercase">
                  Merender
                </span>
              </div>
            )}
            {shownPreview && !preview && (
              <span role="status" className="sr-only">
                Memperbarui pratinjau
              </span>
            )}
          </div>

          <div className="flex flex-col gap-8">
            <fieldset>
              <legend className="font-display text-label font-extrabold tracking-[0.12em] text-ink uppercase">
                Filter
              </legend>
              <div className="mt-3 grid grid-cols-2 gap-3 min-[380px]:grid-cols-3">
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
                <span className="ml-2 font-bold tracking-[0.1em] text-ink-meta">
                  · {sticker ? STICKERS[sticker].name : "Tanpa"}
                </span>
              </legend>
              <p className="mt-2 text-small text-ink-body">
                Ditempel di pojok kiri bawah strip, di atas frame.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2.5 max-sm:[&>button:last-child]:col-start-2 sm:grid-cols-4">
                <StickerOption
                  stickerKey={null}
                  selected={sticker === null}
                  onSelect={() => setSticker(null)}
                />
                {STICKER_KEYS.map((key) => (
                  <StickerOption
                    key={key}
                    stickerKey={key}
                    selected={sticker === key}
                    onSelect={() => setSticker(key)}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="font-display text-label font-extrabold tracking-[0.12em] text-ink uppercase">
                Frame
                <span className="ml-2 font-bold tracking-[0.1em] text-ink-meta">
                  · {activeFrame ? activeFrame.name : "Tanpa"}
                </span>
              </legend>
              <div
                role="group"
                aria-label="Kategori frame"
                className="mt-3 flex flex-wrap gap-2"
              >
                {(["all", ...FRAME_CATEGORIES] as const).map((category) => {
                  const active = category === frameCategory;
                  return (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setFrameCategory(category)}
                      className={`pressable rounded-[var(--radius-pill)] border-2 border-ink px-3 py-1.5 font-display text-label font-bold tracking-[0.1em] uppercase shadow-lift-1 ${
                        active
                          ? "bg-ink text-bg"
                          : "bg-elev text-ink-body hover:bg-butter hover:text-ink"
                      }`}
                    >
                      {category === "all"
                        ? "Semua"
                        : FRAME_CATEGORY_LABEL[category]}
                    </button>
                  );
                })}
              </div>
              <div
                className={`mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4 ${frameGridClass}`}
              >
                <FrameOption
                  frame={null}
                  selected={activeFrame === null}
                  onSelect={() => setFrameKey(null)}
                />
                {visibleFrames.map((frame) => (
                  <FrameOption
                    key={frame.key}
                    frame={frame}
                    selected={activeFrame?.key === frame.key}
                    onSelect={() => setFrameKey(frame.key)}
                  />
                ))}
              </div>
              {framesLoading && (
                <p role="status" className="mt-2.5 text-small font-semibold text-ink-meta">
                  Memuat frame event...
                </p>
              )}
              {framesError && (
                <p className="mt-2.5 text-small font-semibold text-ink-meta">
                  {framesError}
                </p>
              )}
              {hasHiddenDynamicFrames && (
                <p className="mt-2.5 text-small font-semibold text-ink-meta">
                  Frame event hanya muncul di layout yang sesuai.
                </p>
              )}
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
                className={`pressable inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-pink px-7 py-4 font-display text-lead font-extrabold text-ink shadow-lift-2 hover:bg-[var(--mix-coral)] disabled:cursor-not-allowed sm:w-auto ${
                  saving || !shownPreview ? "opacity-45" : ""
                }`}
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
                className="pressable inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-elev px-7 py-4 font-display text-lead font-bold text-ink shadow-lift-2 hover:bg-butter sm:w-auto"
              >
                <IconArrowBackUp size={22} stroke={2.5} aria-hidden="true" />
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
      <SiteFooter />
    </div>
  );
}
