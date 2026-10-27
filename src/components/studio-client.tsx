"use client";

import {
  IconArrowBackUp,
  IconArrowLeft,
  IconCamera,
  IconCheck,
  IconDeviceFloppy,
  IconFrame,
  IconLayoutGrid,
  IconPalette,
  IconPhoto,
  IconSticker,
  IconTrash,
  IconWand,
  IconX,
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
  clearBoothRun,
  clearDraft,
  getDraftSnapshot,
  restoreDraftToBooth,
  subscribeDraft,
} from "@/lib/draft-store";
import { deleteRunClips, takeClip } from "@/lib/live-photo";
import {
  CUSTOM_ACCENT_COLORS,
  CUSTOM_FRAME_DEFAULTS,
  CUSTOM_FRAME_STYLE_LABEL,
  CUSTOM_FRAME_STYLES,
  CUSTOM_PAPER_COLORS,
  MAX_CUSTOM_CAPTION,
  customFramePreset,
  type CustomFrameOptions,
} from "@/lib/custom-frame";
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
import { BackLink, backIconFor } from "@/components/back-link";
import { ConfirmDialog } from "@/components/confirm-dialog";
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

async function uploadLiveClips(
  accessKey: string,
  runId: string,
  slots: { slot: number; mime: string; durationMs: number }[],
): Promise<void> {
  try {
    const form = new FormData();
    for (const meta of slots) {
      const clip = await takeClip(runId, meta.slot);
      if (clip) {
        form.append(`slot-${meta.slot}`, clip.blob, `clip-${meta.slot}.${clip.mime.includes("mp4") ? "mp4" : "webm"}`);
      }
    }
    if (form.has(`slot-0`) || form.has(`slot-1`) || form.has(`slot-2`) || form.has(`slot-3`)) {
      await fetch(`/api/sessions/${accessKey}/live`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(10000),
      });
    }
  } catch {
    // Best effort; photo already saved.
  } finally {
    void deleteRunClips(runId);
  }
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
  onBackClick,
}: {
  layoutLabel?: string;
  back?: { href: string; label: string };
  onBackClick?: (e: React.MouseEvent) => void;
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
          {onBackClick ? (
            <button
              type="button"
              onClick={onBackClick}
              className="pressable inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-pill)] border-2 border-ink bg-elev px-3.5 py-1.5 font-display text-label font-bold tracking-[0.1em] text-ink uppercase shadow-lift-1 hover:bg-butter"
            >
              {backIconFor(back.label)}
              <span className="sr-only sm:not-sr-only">{back.label}</span>
            </button>
          ) : (
            <BackLink href={back.href} label={back.label} />
          )}
          <span className="hidden items-center gap-2 rounded-[var(--radius-pill)] border-2 border-ink bg-butter px-4 py-1.5 font-display text-label font-extrabold tracking-[0.12em] text-ink uppercase sm:inline-flex">
            <IconPalette size={16} stroke={2.5} aria-hidden="true" />
            Studio
          </span>
          {layoutLabel && (
            <span className="inline-flex min-w-0 items-center gap-2 truncate rounded-[var(--radius-pill)] border-2 border-ink bg-mint px-4 py-1.5 font-display text-label font-bold tracking-[0.12em] text-ink uppercase">
              <IconLayoutGrid
                size={16}
                stroke={2.5}
                aria-hidden="true"
                className="shrink-0"
              />
              <span className="truncate">{layoutLabel}</span>
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
  const [customOptions, setCustomOptions] = useState<CustomFrameOptions>(
    CUSTOM_FRAME_DEFAULTS,
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
    frame: FramePreset | null;
    frameName: string | null;
    dataUrl: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publish, setPublish] = useState(false);
  const [publishNotice, setPublishNotice] = useState<string | null>(null);
  const [backDialogOpen, setBackDialogOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

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
  const customFrame = useMemo(
    () => customFramePreset(customOptions),
    [customOptions],
  );
  const frameMap = useMemo(
    () =>
      new Map(
        [...allFrames, customFrame].map((frame) => [frame.key, frame]),
      ),
    [allFrames, customFrame],
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
    renderedForDraft.frame === activeFrame
      ? renderedForDraft.dataUrl
      : null;
  const shownPreview = preview ?? renderedForDraft?.dataUrl ?? null;
  const shownSticker = preview
    ? sticker
    : (renderedForDraft?.sticker ?? null);
  const shownFrameName = preview
    ? (activeFrame?.name ?? null)
    : (renderedForDraft?.frameName ?? null);

  function updateCustomOptions(patch: Partial<CustomFrameOptions>) {
    setCustomOptions((current) => ({ ...current, ...patch }));
  }

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
      transforms: draft.transforms,
    })
      .then(async (dataUrl) => {
        if (cancelled) return;
        await decodePreview(dataUrl);
        if (cancelled) return;
        setRendered({
          draft,
          filterKey,
          sticker,
          frame: activeFrame,
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

      if (draft.live?.runId && draft.live.slots.length > 0) {
        void uploadLiveClips(data.accessKey, draft.live.runId, draft.live.slots);
      }

      if (publish && !data.published) {
        setPublishNotice(
          "Fotomu tersimpan, tapi gagal masuk galeri publik. Coba lagi nanti.",
        );
      }
      clearDraft();
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
    if (leaving) {
      return (
        <div className="flex flex-1 flex-col">
          <StudioHeader back={{ href: "/", label: "Beranda" }} />
          <main className="shell flex flex-1 flex-col justify-center py-[var(--page)]">
            <h1 className="sr-only">Studio foto</h1>
            <p className="text-lead text-ink-body">Kembali ke booth...</p>
          </main>
          <SiteFooter />
        </div>
      );
    }

    return (
      <div className="flex flex-1 flex-col">
        <StudioHeader back={{ href: "/", label: "Beranda" }} />
        <main className="shell flex flex-1 flex-col justify-center py-[var(--page)]">
          <div className="max-w-[var(--measure)] rounded-[var(--radius-xl)] border-2 border-ink bg-elev p-8 shadow-lift-2">
            <h1 className="font-display text-h2 font-extrabold text-ink">
              Belum ada foto
            </h1>
            <p className="mt-3 text-lead text-ink-body">
              Studio hanya bisa dibuka setelah kamu mengambil atau mengunggah
              foto di booth.
            </p>
            <button
              type="button"
              onClick={() => router.push("/booth")}
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
  const boothHref = `/booth?from=studio${
    draft.eventId ? `&event=${encodeURIComponent(draft.eventId)}` : ""
  }${draft.source === "upload" ? "&mode=upload" : ""}`;

  function requestBack() {
    if (draft && draft.shots.length > 0) {
      setBackDialogOpen(true);
    } else {
      router.push(boothHref);
    }
  }

  function confirmBackToBooth(keep: boolean) {
    setBackDialogOpen(false);
    if (keep) {
      // Rebuild the booth's own run snapshot so the layout and photos are
      // waiting there, not just in the studio's draft key.
      if (draft) restoreDraftToBooth(draft);
      router.push(boothHref);
      return;
    }
    // The discarded draft breaks the studio leg of the journey, so the booth
    // must drop the "from=studio" trail and aim its back pill at Beranda.
    // Event context still matters; upload guests keep their upload editor.
    const discardParams: string[] = [];
    if (draft?.eventId) {
      discardParams.push(`event=${encodeURIComponent(draft.eventId)}`);
    }
    if (draft?.source === "upload") {
      discardParams.push("mode=upload");
    }
    // Show a neutral state while the draft clears, so the empty-studio
    // "Belum ada foto" card does not flash before the booth takes over.
    setLeaving(true);
    clearDraft();
    router.push(
      discardParams.length > 0
        ? `/booth?${discardParams.join("&")}`
        : "/booth",
    );
  }

  // "Ambil ulang" / "Ganti foto" is an explicit retake, not a back action:
  // start the booth empty so the guest can shoot or upload again. The studio
  // draft stays behind as a safety net until the new run replaces it.
  function retake() {
    clearBoothRun();
    router.push(boothHref);
  }

  const visibleFrames = filterFrames(
    allFrames,
    frameCategory,
    draft.layoutType,
  );
  const hasHiddenDynamicFrames = dynamicFrames.some(
    (frame) => !frameSupportsLayout(frame, draft.layoutType),
  );
  const frameGridClass =
    (2 + visibleFrames.length) % 3 === 1
      ? "max-sm:[&>button:last-child]:col-start-2"
      : "";

  return (
    <div className="flex flex-1 flex-col">
      <StudioHeader
        layoutLabel={layout.label}
        back={{
          href: boothHref,
          label: draft.source === "upload" ? "Foto" : "Booth",
        }}
        onBackClick={requestBack}
      />

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
              <legend className="flex items-center gap-2 font-display text-label font-extrabold tracking-[0.12em] text-ink uppercase">
                <IconWand size={16} stroke={2.5} aria-hidden="true" />
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
              <legend className="flex flex-wrap items-center gap-2 font-display text-label font-extrabold tracking-[0.12em] text-ink uppercase">
                <IconSticker size={16} stroke={2.5} aria-hidden="true" />
                Stiker
                <span className="font-bold tracking-[0.1em] text-ink-meta">
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
              <legend className="flex flex-wrap items-center gap-2 font-display text-label font-extrabold tracking-[0.12em] text-ink uppercase">
                <IconFrame size={16} stroke={2.5} aria-hidden="true" />
                Frame
                <span className="font-bold tracking-[0.1em] text-ink-meta">
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
                <FrameOption
                  frame={customFrame}
                  selected={activeFrame?.key === "custom"}
                  onSelect={() => setFrameKey("custom")}
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
              {activeFrame?.key === "custom" && (
                <div
                  data-testid="custom-frame-controls"
                  className="mt-4 rounded-[var(--radius-lg)] border-2 border-ink bg-sunken p-4 shadow-lift-1"
                >
                  <div>
                    <p className="font-display text-label font-extrabold tracking-[0.1em] text-ink uppercase">
                      Gaya
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {CUSTOM_FRAME_STYLES.map((style) => {
                        const active = customOptions.style === style;
                        return (
                          <button
                            key={style}
                            type="button"
                            aria-pressed={active}
                            onClick={() => updateCustomOptions({ style })}
                            className={`pressable rounded-[var(--radius-pill)] border-2 border-ink px-3 py-1.5 font-display text-label font-bold tracking-[0.08em] uppercase shadow-lift-1 ${
                              active
                                ? "bg-butter text-ink"
                                : "bg-elev text-ink-body hover:bg-butter hover:text-ink"
                            }`}
                          >
                            {CUSTOM_FRAME_STYLE_LABEL[style]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="font-display text-label font-extrabold tracking-[0.1em] text-ink uppercase">
                        Warna kertas
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {CUSTOM_PAPER_COLORS.map((color) => {
                          const active = customOptions.paper === color.value;
                          return (
                            <button
                              key={color.value}
                              type="button"
                              aria-label={`Warna kertas ${color.label}`}
                              aria-pressed={active}
                              title={color.label}
                              onClick={() =>
                                updateCustomOptions({ paper: color.value })
                              }
                              className={`grid size-9 place-items-center rounded-full border-2 border-ink shadow-lift-1 ${
                                active
                                  ? "ring-2 ring-ink ring-offset-2 ring-offset-sunken"
                                  : ""
                              }`}
                              style={{ background: color.value }}
                            >
                              {active && (
                                <IconCheck
                                  size={16}
                                  stroke={3}
                                  aria-hidden="true"
                                  className="text-ink"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <p className="font-display text-label font-extrabold tracking-[0.1em] text-ink uppercase">
                        Warna aksen
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {CUSTOM_ACCENT_COLORS.map((color) => {
                          const active = customOptions.accent === color.value;
                          return (
                            <button
                              key={color.value}
                              type="button"
                              aria-label={`Warna aksen ${color.label}`}
                              aria-pressed={active}
                              title={color.label}
                              onClick={() =>
                                updateCustomOptions({ accent: color.value })
                              }
                              className={`grid size-9 place-items-center rounded-full border-2 border-ink shadow-lift-1 ${
                                active
                                  ? "ring-2 ring-ink ring-offset-2 ring-offset-sunken"
                                  : ""
                              }`}
                              style={{ background: color.value }}
                            >
                              {active && (
                                <IconCheck
                                  size={16}
                                  stroke={3}
                                  aria-hidden="true"
                                  className="text-ink"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label
                      htmlFor="custom-caption"
                      className="flex flex-wrap items-baseline justify-between gap-2 font-display text-label font-extrabold tracking-[0.1em] text-ink uppercase"
                    >
                      Tulisan
                      <span className="font-bold tracking-[0.04em] text-ink-meta normal-case">
                        maks {MAX_CUSTOM_CAPTION} karakter
                      </span>
                    </label>
                    <input
                      id="custom-caption"
                      type="text"
                      maxLength={MAX_CUSTOM_CAPTION}
                      value={customOptions.caption}
                      onChange={(event) =>
                        updateCustomOptions({
                          caption: Array.from(event.target.value)
                            .slice(0, MAX_CUSTOM_CAPTION)
                            .join(""),
                        })
                      }
                      placeholder="Nama, tanggal, atau kata-kata"
                      className="mt-2 w-full rounded-[var(--radius)] border-2 border-ink bg-elev px-3 py-2 font-semibold text-ink shadow-lift-1 placeholder:text-ink-meta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <label className="flex cursor-pointer items-center gap-2 text-small font-semibold text-ink">
                      <input
                        type="checkbox"
                        checked={customOptions.showDate}
                        onChange={(event) =>
                          updateCustomOptions({ showDate: event.target.checked })
                        }
                        className="size-5 accent-[var(--pink)]"
                      />
                      Tanggal hari ini
                    </label>
                    <button
                      type="button"
                      onClick={() => setCustomOptions(CUSTOM_FRAME_DEFAULTS)}
                      className="pressable inline-flex items-center gap-2 rounded-[var(--radius-pill)] border-2 border-ink bg-elev px-3 py-1.5 font-display text-label font-bold tracking-[0.08em] text-ink uppercase shadow-lift-1 hover:bg-butter"
                    >
                      Reset custom
                    </button>
                  </div>
                </div>
              )}
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
                onClick={retake}
                className="pressable inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-elev px-7 py-4 font-display text-lead font-bold text-ink shadow-lift-2 hover:bg-butter sm:w-auto"
              >
                <IconArrowBackUp size={22} stroke={2.5} aria-hidden="true" />
                {draft.source === "upload" ? "Ganti foto" : "Ambil ulang"}
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

            <p className="flex items-center gap-2 font-display text-label font-bold tracking-[0.12em] text-ink-meta uppercase">
              {draft.source === "upload" ? (
                <IconPhoto size={15} stroke={2.5} aria-hidden="true" />
              ) : (
                <IconCamera size={15} stroke={2.5} aria-hidden="true" />
              )}
              {draft.shots.length} {draft.source === "upload" ? "foto" : "bidikan"} /{" "}
              {layout.canvas.w} x {layout.canvas.h}
            </p>
          </div>
        </div>
      </main>
      <SiteFooter />

      {backDialogOpen && (
        <ConfirmDialog
          open={backDialogOpen}
          title={`Mau kembali ke ${draft.source === "upload" ? "foto" : "booth"}?`}
          description={`Kamu punya ${draft.shots.length} ${
            draft.source === "upload" ? "foto" : "bidikan"
          } yang belum disimpan ke galeri. Mau diapakan?`}
          icon={<IconArrowLeft size={22} stroke={2.5} aria-hidden="true" />}
          onClose={() => setBackDialogOpen(false)}
          actions={[
            {
              label: "Simpan ke draft & kembali",
              description:
                "Foto dan layout tetap tersimpan, siap dilanjutkan di booth.",
              icon: (
                <IconDeviceFloppy size={20} stroke={2.5} aria-hidden="true" />
              ),
              tone: "primary",
              onClick: () => confirmBackToBooth(true),
            },
            {
              label: "Buang foto & kembali",
              description: "Foto dihapus, booth mulai lagi dengan sesi kosong.",
              icon: <IconTrash size={20} stroke={2.5} aria-hidden="true" />,
              tone: "danger",
              onClick: () => confirmBackToBooth(false),
            },
            {
              label: "Batal, tetap di studio",
              icon: <IconX size={20} stroke={2.5} aria-hidden="true" />,
              tone: "neutral",
              onClick: () => setBackDialogOpen(false),
            },
          ]}
        />
      )}
    </div>
  );
}
