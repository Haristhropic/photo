"use client";

import {
  IconArrowBackUp,
  IconArrowLeft,
  IconArrowsDiagonal2,
  IconCamera,
  IconCheck,
  IconDeviceFloppy,
  IconFrame,
  IconLayoutGrid,
  IconPalette,
  IconPhoto,
  IconRestore,
  IconRotate,
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
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
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
  PRINT_RADIUS,
  type FilterKey,
} from "@/lib/layouts";
import {
  addStickerToStrip,
  renderStrip,
  stickerAnchors,
  type Draft,
} from "@/lib/render";
import {
  STICKERS,
  STICKER_ART,
  STICKER_KEYS,
  STICKER_SCALE_MAX,
  STICKER_SCALE_MIN,
  paintSticker,
  stickerGeometry,
  type StickerKey,
  type StickerPreset,
  type StickerSpot,
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
import { ConfirmDialog, type ConfirmAction } from "@/components/confirm-dialog";
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
  count = 0,
  onSelect,
}: {
  stickerKey: StickerKey;
  selected: boolean;
  count?: number;
  onSelect: () => void;
}) {
  const preset = STICKERS[stickerKey];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={`${preset.name} — ${preset.blurb}`}
      className={`pressable flex flex-col gap-1.5 rounded-[14px] border-2 border-ink p-1.5 text-left shadow-lift-1 ${
        selected ? "bg-butter" : "bg-elev hover:bg-sunken"
      }`}
    >
      <span className="relative block">
        <StickerSwatch stickerKey={stickerKey} />
        {count > 1 && (
          <span
            aria-hidden="true"
            className="absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full border-2 border-ink bg-ink font-display text-[11px] font-extrabold text-bg"
          >
            {count}
          </span>
        )}
      </span>
      <span className="block truncate px-0.5 font-display text-label font-extrabold tracking-[0.04em] text-ink uppercase">
        {preset.name}
      </span>
    </button>
  );
}

/** The die-cut artwork for one sticker layer, painted once per sticker. */
function StickerCanvas({ stickerKey }: { stickerKey: StickerKey }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const preset = STICKERS[stickerKey];
    let cancelled = false;
    const ratio = 2;
    canvas.width = STICKER_ART.w * ratio;
    canvas.height = STICKER_ART.h * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const paint = () => {
      if (cancelled) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      paintSticker(ctx, preset);
    };

    // Sticker lettering is set in the display face; repaint after fonts settle
    // so the overlay never shows a fallback the saved PNG would not use.
    if (typeof document !== "undefined" && document.fonts) {
      document.fonts.ready.then(paint).catch(paint);
    } else {
      paint();
    }

    return () => {
      cancelled = true;
    };
  }, [stickerKey]);

  return (
    <canvas
      ref={ref}
      width={STICKER_ART.w * 2}
      height={STICKER_ART.h * 2}
      aria-hidden="true"
      className="pointer-events-none block h-full w-full"
    />
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
          aria-label="StripSnap, kembali ke beranda"
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

/**
 * The preview card is printed slightly off-register. The same angle is used by
 * the drag math: a pointer move on a tilted card is not a move on the print.
 */
const PREVIEW_TILT = -0.7;
const TILT_RADIANS = (PREVIEW_TILT * Math.PI) / 180;

/**
 * Every layout prints at the same height so switching formats does not resize
 * the studio. The card is capped a little above the fold so the print reads
 * big without crowding the header or running past the bottom of the screen.
 */
const PREVIEW_HEIGHT_VH = 76;

function clampScale(scale: number): number {
  return Math.min(STICKER_SCALE_MAX, Math.max(STICKER_SCALE_MIN, scale));
}

/** Keep the stored angle readable: a guest can spin past a full turn, but the
 *  saved spot only needs the equivalent -180..180 angle. */
function normalizeDegrees(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

/**
 * One sticker on the print. `spot` is the guest's transform; null means the
 * layout's default corner, seeded on first touch. `origin` is where "Atur
 * ulang" sends it back to — null for the first sticker, a cascaded corner for
 * the ones added after it, so reset never stacks them on top of each other.
 */
type StickerPlacement = {
  id: number;
  key: StickerKey;
  spot: StickerSpot | null;
  origin: StickerSpot | null;
};

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
  // The studio starts with one classic corner sticker. Every tap on the picker
  // adds another placement, and each one keeps its own transform.
  const [stickers, setStickers] = useState<StickerPlacement[]>([
    { id: 1, key: "senyum", spot: null, origin: null },
  ]);
  const [selectedStickerId, setSelectedStickerId] = useState<number | null>(1);
  const [stickerSelected, setStickerSelected] = useState(false);
  const [draggingSticker, setDraggingSticker] = useState(false);
  const nextStickerIdRef = useRef(2);
  const previewBoxRef = useRef<HTMLDivElement | null>(null);
  // Every pointer currently held, tagged with the sticker it landed on. One
  // pointer means a drag; a second on the same sticker turns into a pinch that
  // scales and rotates at once.
  const stickerPointersRef = useRef(
    new Map<number, { x: number; y: number; stickerId: number }>(),
  );
  const stickerMoveRef = useRef<{
    pointerId: number;
    stickerId: number;
    startX: number;
    startY: number;
    startSpot: StickerSpot;
  } | null>(null);
  const stickerPinchRef = useRef<{
    stickerId: number;
    startSpot: StickerSpot;
    startDistance: number;
    startAngle: number;
    startMidX: number;
    startMidY: number;
  } | null>(null);
  // A drag on one of the corner handles. The maths runs from the sticker's
  // centre in screen space, which cancels the card's own tilt.
  const stickerHandleRef = useRef<{
    mode: "rotate" | "scale";
    pointerId: number;
    stickerId: number;
    centerX: number;
    centerY: number;
    startAngle: number;
    startDistance: number;
    startSpot: StickerSpot;
  } | null>(null);
  // Assigned after each render so the native wheel listener can read the
  // latest spot without being re-bound mid-gesture.
  const scaleStickerRef = useRef<(id: number, factor: number) => void>(
    () => {},
  );
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
  // superseded draft, filter or frame is simply not readable and can never be
  // uploaded against inputs the guest has already moved on from. Stickers are
  // deliberately absent: they live in a DOM layer so dragging does not re-render
  // the photos, and they are stamped onto the PNG only when saving.
  const [rendered, setRendered] = useState<{
    draft: Draft;
    filterKey: FilterKey;
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
  // The design is seeded once per studio visit. A later save-draft writes a
  // newer draft object and must not re-run this over the guest's edits.
  const designSeededRef = useRef(false);

  const builtIn = useMemo(() => builtInFrames(), []);
  const eventId = draft?.eventId ?? null;
  // Derived rather than synchronously set in the effect; the previous frames
  // stay visible while the next event's catalogue loads.
  const framesLoading = loadedEventId !== eventId;

  /* eslint-disable react-hooks/set-state-in-effect -- the draft arrives after
     hydration, so a saved design can only be replayed from an effect. */
  useEffect(() => {
    if (!draft || designSeededRef.current) return;
    designSeededRef.current = true;

    const saved = draft.design;
    if (!saved) return;

    setFilterKey(saved.filterKey);
    setFrameKey(saved.frameKey);
    setCustomOptions(saved.customFrame ?? CUSTOM_FRAME_DEFAULTS);

    const restored = saved.stickers.map((sticker, index) => ({
      id: index + 1,
      key: sticker.key,
      spot: sticker.spot,
      origin: null,
    }));
    setStickers(restored);
    nextStickerIdRef.current = restored.length + 1;
    setSelectedStickerId(restored[0]?.id ?? null);
    setStickerSelected(false);
  }, [draft]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
    renderedForDraft.frame === activeFrame
      ? renderedForDraft.dataUrl
      : null;
  const shownPreview = preview ?? renderedForDraft?.dataUrl ?? null;
  const shownFrameName = preview
    ? (activeFrame?.name ?? null)
    : (renderedForDraft?.frameName ?? null);
  const hasPreview = shownPreview !== null;

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
      frame: activeFrame,
      eventLabel: null,
      transforms: draft.transforms,
      source: draft.source,
    })
      .then(async (dataUrl) => {
        if (cancelled) return;
        await decodePreview(dataUrl);
        if (cancelled) return;
        setRendered({
          draft,
          filterKey,
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
  }, [draft, filterKey, activeFrame]);

  // A mouse wheel over any sticker scales that sticker in place. React attaches
  // wheel listeners passively, so this one is native to be able to stop the page
  // from scrolling under the pointer.
  useEffect(() => {
    const box = previewBoxRef.current;
    if (!box) return;
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const layer = target.closest<HTMLElement>("[data-sticker-id]");
      if (!layer) return;
      event.preventDefault();
      const id = Number(layer.dataset.stickerId);
      if (!Number.isFinite(id)) return;
      scaleStickerRef.current(id, Math.exp(-event.deltaY * 0.0012));
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [hasPreview]);

  // The wheel listener is bound once per preview, so it reads the scale action
  // through a ref. Updating that ref after every render keeps the wheel working
  // from the spot currently on screen without re-binding during the gesture.
  useEffect(() => {
    scaleStickerRef.current = (id: number, factor: number) => {
      const base = activeStickerSpot(id);
      if (!base) return;
      setStickerSpotFor(id, { ...base, scale: clampScale(base.scale * factor) });
    };
  });

  // Tapping anywhere that is not the sticker or its tools dismisses them, the
  // same way a photo editor closes a selection.
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-sticker-ui]")) return;
      setStickerSelected(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const save = useCallback(async () => {
    if (!draft || !preview || saving) return;
    setSaving(true);
    setError(null);

    try {
      // The preview is deliberately sticker-free so dragging stays cheap. Stamp
      // every placement at save time using the same geometry the layers used, in
      // the same order, so what the guest placed is what lands in the PNG.
      const image =
        stickers.length > 0
          ? await addStickerToStrip({
              base: preview,
              stickers: stickers.map(({ key, spot }) => ({ key, spot })),
              layoutType: draft.layoutType,
              frame: activeFrame,
            })
          : preview;
      const imageBlob = dataUrlToBlob(image);
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

      // Only a camera run can be live. Uploaded photos have no recorded clip,
      // so they stay still on the result page however they are shared.
      if (
        draft.source === "camera" &&
        draft.live?.runId &&
        draft.live.slots.length > 0
      ) {
        try { await uploadLiveClips(data.accessKey, draft.live.runId, draft.live.slots); } catch {}
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
  }, [
    draft,
    preview,
    saving,
    filterKey,
    publish,
    router,
    stickers,
    activeFrame,
  ]);

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
  // The booth would otherwise open on its default frame after a back step, so
  // every return trip carries the frame the guest actually chose.
  const boothHref = `/booth?from=studio${
    draft.eventId ? `&event=${encodeURIComponent(draft.eventId)}` : ""
  }${draft.source === "upload" ? "&mode=upload" : ""}&layout=${draft.layoutType}`;

  // Every layer and the saved PNG share this one calculation, so dragging can
  // never drift from what `addStickerToStrip` paints.
  const stickerAnchor = stickerAnchors(activeFrame, layout);
  const stickerLayers = stickers.map((placement) => {
    const preset = STICKERS[placement.key];
    const geo = stickerGeometry(preset, layout, {
      ...stickerAnchor,
      spot: placement.spot,
    });
    return { ...placement, preset, geo };
  });
  const selectedLayer =
    stickerLayers.find((layer) => layer.id === selectedStickerId) ?? null;

  function presetFor(id: number): StickerPreset | null {
    const placement = stickers.find((item) => item.id === id);
    return placement ? STICKERS[placement.key] : null;
  }

  function setStickerSpotFor(id: number, spot: StickerSpot | null) {
    setStickers((current) =>
      current.map((placement) =>
        placement.id === id ? { ...placement, spot } : placement,
      ),
    );
    // Any edit also makes that sticker the active one, so the handles and the
    // panel can never point at different stickers.
    setSelectedStickerId(id);
    setStickerSelected(true);
  }

  function currentStickerSpot(id: number): StickerSpot | null {
    const layer = stickerLayers.find((item) => item.id === id);
    if (!layer) return null;
    // Anchor to the geometry that is actually on screen, not the raw stored
    // fraction: a drag beyond the paper edge is clamped by `stickerGeometry`,
    // and restarting from the raw value would snap the sticker back out.
    return {
      x: layer.geo.cx / layout.canvas.w,
      y: layer.geo.cy / layout.canvas.h,
      rotation: layer.spot?.rotation ?? 0,
      scale: layer.spot?.scale ?? 1,
    };
  }

  /** The spot a gesture should start from, seeding the state on first contact
   *  so the sticker does not jump away from its default corner. */
  function activeStickerSpot(id: number): StickerSpot | null {
    const layer = stickerLayers.find((item) => item.id === id);
    if (!layer) return null;
    const base = currentStickerSpot(id);
    if (!base) return null;
    if (!layer.spot) setStickerSpotFor(id, base);
    return base;
  }

  function moveStickerByPointer(
    id: number,
    clientX: number,
    clientY: number,
    start: { startX: number; startY: number; startSpot: StickerSpot },
  ) {
    const box = previewBoxRef.current;
    if (!box) return;
    const displayScale = box.offsetWidth / layout.canvas.w;
    if (displayScale <= 0) return;

    const dx = clientX - start.startX;
    const dy = clientY - start.startY;
    // The card is tilted, so undo that rotation before treating the pointer
    // move as a move on the paper. Without this the sticker slides against the
    // drag direction by about a degree.
    const cos = Math.cos(TILT_RADIANS);
    const sin = Math.sin(TILT_RADIANS);
    const localX = dx * cos + dy * sin;
    const localY = -dx * sin + dy * cos;

    setStickerSpotFor(id, {
      ...start.startSpot,
      x: start.startSpot.x + localX / displayScale / layout.canvas.w,
      y: start.startSpot.y + localY / displayScale / layout.canvas.h,
    });
  }

  /** Rebuild the gesture for one sticker from the pointers still down on it:
   *  two make a pinch, one keeps dragging from where it is now. */
  function syncStickerGesture(id: number) {
    const points = [...stickerPointersRef.current.entries()].filter(
      ([, point]) => point.stickerId === id,
    );

    if (points.length >= 2) {
      const [, first] = points[0];
      const [, second] = points[1];
      const base = currentStickerSpot(id);
      if (!base) return;
      stickerPinchRef.current = {
        stickerId: id,
        startSpot: base,
        startDistance: Math.max(
          Math.hypot(second.x - first.x, second.y - first.y),
          1,
        ),
        startAngle:
          Math.atan2(second.y - first.y, second.x - first.x) *
          (180 / Math.PI),
        startMidX: (first.x + second.x) / 2,
        startMidY: (first.y + second.y) / 2,
      };
      if (stickerMoveRef.current?.stickerId === id) stickerMoveRef.current = null;
      return;
    }

    if (stickerPinchRef.current?.stickerId === id) stickerPinchRef.current = null;
    if (points.length === 1) {
      const [pointerId, point] = points[0];
      const base = currentStickerSpot(id);
      stickerMoveRef.current = base
        ? {
            pointerId,
            stickerId: id,
            startX: point.x,
            startY: point.y,
            startSpot: base,
          }
        : null;
      return;
    }

    // Only tear down the gesture that belongs to this sticker: another finger
    // may still be dragging a different one.
    if (stickerMoveRef.current?.stickerId === id) stickerMoveRef.current = null;
    if (stickerPinchRef.current?.stickerId === id) stickerPinchRef.current = null;
    if (stickerPointersRef.current.size === 0) setDraggingSticker(false);
  }

  function startStickerPointer(
    id: number,
    event: React.PointerEvent<HTMLButtonElement>,
  ) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const base = activeStickerSpot(id);
    if (!base) return;
    event.preventDefault();
    // Pointerdown's default action is focus; keep it available for keyboard
    // nudging even though the event is cancelled to stop text selection.
    event.currentTarget.focus({ preventScroll: true });
    setSelectedStickerId(id);
    setStickerSelected(true);
    setDraggingSticker(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    stickerPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      stickerId: id,
    });
    syncStickerGesture(id);
  }

  function moveStickerPointer(event: React.PointerEvent<HTMLButtonElement>) {
    const point = stickerPointersRef.current.get(event.pointerId);
    if (!point) return;
    stickerPointersRef.current.set(event.pointerId, {
      ...point,
      x: event.clientX,
      y: event.clientY,
    });

    const pinch = stickerPinchRef.current;
    const box = previewBoxRef.current;
    if (pinch && pinch.stickerId === point.stickerId && box) {
      const points = [...stickerPointersRef.current.values()].filter(
        (candidate) => candidate.stickerId === pinch.stickerId,
      );
      if (points.length >= 2) {
        const [first, second] = points;
        const distance = Math.hypot(second.x - first.x, second.y - first.y);
        const angle =
          Math.atan2(second.y - first.y, second.x - first.x) *
          (180 / Math.PI);
        const midX = (first.x + second.x) / 2;
        const midY = (first.y + second.y) / 2;
        const displayScale = box.offsetWidth / layout.canvas.w;
        if (displayScale <= 0) return;

        const dx = midX - pinch.startMidX;
        const dy = midY - pinch.startMidY;
        const cos = Math.cos(TILT_RADIANS);
        const sin = Math.sin(TILT_RADIANS);

        setStickerSpotFor(pinch.stickerId, {
          ...pinch.startSpot,
          x:
            pinch.startSpot.x +
            (dx * cos + dy * sin) / displayScale / layout.canvas.w,
          y:
            pinch.startSpot.y +
            (-dx * sin + dy * cos) / displayScale / layout.canvas.h,
          // Screen y grows downward, so a clockwise finger turn is a positive
          // angle here - the same sign CSS `rotate()` uses.
          rotation: normalizeDegrees(
            pinch.startSpot.rotation + (angle - pinch.startAngle),
          ),
          scale: clampScale(
            pinch.startSpot.scale * (distance / pinch.startDistance),
          ),
        });
        return;
      }
    }

    const move = stickerMoveRef.current;
    if (!move || move.pointerId !== event.pointerId) return;
    moveStickerByPointer(move.stickerId, event.clientX, event.clientY, move);
  }

  function endStickerPointer(event: React.PointerEvent<HTMLButtonElement>) {
    const point = stickerPointersRef.current.get(event.pointerId);
    stickerPointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!point) return;

    const move = stickerMoveRef.current;
    if (move?.pointerId === event.pointerId) stickerMoveRef.current = null;
    // Lifting one of two fingers should not drop the sticker: the pointers
    // still down take over from the geometry now on screen.
    syncStickerGesture(point.stickerId);
  }

  function startStickerHandle(
    id: number,
    mode: "rotate" | "scale",
    event: React.PointerEvent<HTMLSpanElement>,
  ) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const base = activeStickerSpot(id);
    const layer = previewBoxRef.current?.querySelector<HTMLElement>(
      `[data-sticker-id="${id}"]`,
    );
    if (!base || !layer) return;
    event.preventDefault();
    event.stopPropagation();

    const rect = layer.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    stickerHandleRef.current = {
      mode,
      pointerId: event.pointerId,
      stickerId: id,
      centerX,
      centerY,
      startAngle:
        Math.atan2(event.clientY - centerY, event.clientX - centerX) *
        (180 / Math.PI),
      startDistance: Math.max(
        Math.hypot(event.clientX - centerX, event.clientY - centerY),
        1,
      ),
      startSpot: base,
    };
    setSelectedStickerId(id);
    setStickerSelected(true);
    setDraggingSticker(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveStickerHandle(event: React.PointerEvent<HTMLSpanElement>) {
    const handle = stickerHandleRef.current;
    if (!handle || handle.pointerId !== event.pointerId) return;

    if (handle.mode === "rotate") {
      const angle =
        Math.atan2(
          event.clientY - handle.centerY,
          event.clientX - handle.centerX,
        ) *
        (180 / Math.PI);
      let rotation = handle.startSpot.rotation + (angle - handle.startAngle);
      // Shift gives the deliberate print angles without taking free rotation
      // away from the normal drag. Snap the angle the guest actually sees,
      // which includes the preset's own tilt, not just the relative offset.
      if (event.shiftKey) {
        const presetAngle = presetFor(handle.stickerId)?.rotation ?? 0;
        rotation =
          Math.round((presetAngle + rotation) / 15) * 15 - presetAngle;
      }
      setStickerSpotFor(handle.stickerId, {
        ...handle.startSpot,
        rotation: normalizeDegrees(rotation),
      });
      return;
    }

    const distance = Math.hypot(
      event.clientX - handle.centerX,
      event.clientY - handle.centerY,
    );
    setStickerSpotFor(handle.stickerId, {
      ...handle.startSpot,
      scale: clampScale(
        handle.startSpot.scale * (distance / handle.startDistance),
      ),
    });
  }

  function endStickerHandle(event: React.PointerEvent<HTMLSpanElement>) {
    const handle = stickerHandleRef.current;
    if (!handle || handle.pointerId !== event.pointerId) return;
    stickerHandleRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraggingSticker(false);
  }

  function nudgeSticker(
    id: number,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.blur();
      setStickerSelected(false);
      return;
    }
    const base = activeStickerSpot(id);
    if (!base) return;

    // Shift turns the horizontal arrows into rotation; +/- stays a size
    // change, so the whole transform is reachable without a pointer.
    if (
      event.shiftKey &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      event.preventDefault();
      rotateSticker(id, event.key === "ArrowLeft" ? -5 : 5);
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      resizeSticker(id, 1.06);
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      resizeSticker(id, 1 / 1.06);
      return;
    }

    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 24 : 8;
    setStickerSpotFor(id, {
      ...base,
      x: base.x + (direction[0] * step) / layout.canvas.w,
      y: base.y + (direction[1] * step) / layout.canvas.h,
    });
  }

  function resizeSticker(id: number, factor: number) {
    const base = activeStickerSpot(id);
    if (!base) return;
    setStickerSpotFor(id, { ...base, scale: clampScale(base.scale * factor) });
  }

  function rotateSticker(id: number, degrees: number) {
    const base = activeStickerSpot(id);
    if (!base) return;
    setStickerSpotFor(id, {
      ...base,
      rotation: normalizeDegrees(base.rotation + degrees),
    });
  }

  function resetSticker(id: number) {
    const placement = stickers.find((item) => item.id === id);
    if (!placement) return;
    setStickerSpotFor(id, placement.origin);
    setSelectedStickerId(id);
    setStickerSelected(true);
  }

  // The sliders work in the guest's terms (a percentage and a total angle), so
  // they convert to the spot's relative rotation before saving.
  function setStickerScaleValue(id: number, percent: number) {
    const base = activeStickerSpot(id);
    if (!base) return;
    setStickerSpotFor(id, { ...base, scale: clampScale(percent / 100) });
  }

  function setStickerRotationValue(id: number, degrees: number) {
    const base = activeStickerSpot(id);
    const preset = presetFor(id);
    if (!base || !preset) return;
    setStickerSpotFor(id, {
      ...base,
      rotation: normalizeDegrees(degrees - preset.rotation),
    });
  }

  /**
   * Add one sticker at the next corner: bottom-left, bottom-right, top-left,
   * top-right, then nudge each repeat toward the middle. It is only a visible
   * starting point; the guest can drag it anywhere.
   */
  function addSticker(key: StickerKey) {
    const preset = STICKERS[key];
    const base = stickerGeometry(preset, layout, stickerAnchor);
    const gap = 20;
    const halfW = base.extentX * base.scale;
    const halfH = base.extentY * base.scale;
    const bottom = stickerAnchor.bottom ?? layout.canvas.h;
    const corners = [
      { x: 44 + halfW, y: bottom - gap - halfH },
      { x: layout.canvas.w - 44 - halfW, y: bottom - gap - halfH },
      { x: 44 + halfW, y: 44 + halfH },
      { x: layout.canvas.w - 44 - halfW, y: 44 + halfH },
    ];
    const index = stickers.length;
    const corner = corners[index % corners.length];
    const nudge = Math.floor(index / corners.length) * 34;
    const dirX = corner.x < layout.canvas.w / 2 ? 1 : -1;
    const dirY = corner.y < layout.canvas.h / 2 ? 1 : -1;
    const spot: StickerSpot = {
      x: (corner.x + dirX * nudge) / layout.canvas.w,
      y: (corner.y + dirY * nudge) / layout.canvas.h,
      rotation: 0,
      scale: 1,
    };
    const id = nextStickerIdRef.current;
    nextStickerIdRef.current += 1;
    setStickers((current) => [...current, { id, key, spot, origin: spot }]);
    setSelectedStickerId(id);
    setStickerSelected(true);
  }

  function removeSticker(id: number) {
    const index = stickers.findIndex((item) => item.id === id);
    const next = stickers.filter((item) => item.id !== id);
    setStickers(next);
    if (next.length === 0) {
      setSelectedStickerId(null);
      setStickerSelected(false);
      return;
    }
    if (selectedStickerId === id) {
      setSelectedStickerId(next[Math.min(index, next.length - 1)].id);
      setStickerSelected(true);
    }
  }

  function clearStickers() {
    setStickers([]);
    setSelectedStickerId(null);
    setStickerSelected(false);
  }

  function requestBack() {
    if (draft && draft.shots.length > 0) {
      setBackDialogOpen(true);
    } else {
      router.push(boothHref);
    }
  }

  /**
   * Keeps an uploaded strip and reopens the upload editor on it. The photos
   * only exist in the studio draft, but the booth restores from its own run
   * snapshot, so the draft is handed back before navigating. The draft itself
   * stays behind as a safety net, exactly like a retake leaves it.
   */
  function saveDraftAndBack() {
    setBackDialogOpen(false);
    if (draft) {
      // A draft is the guest's whole print, not just the photos. Hand the
      // studio state back with the run so reopening the studio restores the
      // stickers, frame and filter instead of the preset look.
      restoreDraftToBooth({
        ...draft,
        design: {
          filterKey,
          frameKey,
          customFrame: customOptions,
          stickers: stickers.map(({ key, spot }) => ({ key, spot })),
        },
      });
    }
    router.push(boothHref);
  }

  function confirmBackToBooth() {
    setBackDialogOpen(false);
    // Camera runs have no save option: a run restored to the booth loses its
    // Live clips, which would quietly turn a live strip into a still one.
    // Dropping the draft and starting the booth fresh is the only safe
    // traversal back for them.
    // Event context still matters; upload guests keep their upload editor.
    const discardParams: string[] = [];
    if (draft?.eventId) {
      discardParams.push(`event=${encodeURIComponent(draft.eventId)}`);
    }
    if (draft?.source === "upload") {
      discardParams.push("mode=upload");
    }
    // Keep the frame even when the photos are dropped, so the booth reopens on
    // the layout the guest picked instead of its widest default.
    if (draft?.layoutType) {
      discardParams.push(`layout=${draft.layoutType}`);
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

  // The card's corner is the exported print's corner plus the card's 8px inset
  // (2px border + 6px padding), so the ink mount keeps an even width around the
  // curved print instead of pooling into the corners. The print radius is baked
  // into the PNG (`clipToPrint`), and the preview shows that same shape.
  const printEdge = PRINT_RADIUS / layout.canvas.w;
  const cardRadius = `calc(${printEdge * 100}cqw + ${8 - printEdge * 16}px)`;

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
            className="w-full min-w-0 justify-self-center"
            style={{
              containerType: "inline-size",
              maxWidth: `calc(${(PREVIEW_HEIGHT_VH * layout.canvas.w) / layout.canvas.h}vh + 1rem)`,
            }}
          >
            <div
              className="w-full border-2 border-ink bg-ink p-1.5 shadow-lift-3"
              style={
                {
                  transform: `rotate(${PREVIEW_TILT}deg)`,
                  "--card-radius": cardRadius,
                  borderRadius: "var(--card-radius)",
                } as CSSProperties
              }
            >
              {shownPreview ? (
                <div
                  ref={previewBoxRef}
                  className="relative mx-auto w-full"
                  style={{
                    aspectRatio: `${layout.canvas.w} / ${layout.canvas.h}`,
                    maxWidth: `calc(${(PREVIEW_HEIGHT_VH * layout.canvas.w) / layout.canvas.h}vh)`,
                  }}
                >
                  <img
                    src={shownPreview}
                    width={layout.canvas.w}
                    height={layout.canvas.h}
                    alt={`Pratinjau strip foto${
                      stickers.length ? ` dengan ${stickers.length} stiker` : ""
                    }${shownFrameName ? ` dan frame ${shownFrameName}` : ""}`}
                    aria-busy={!preview}
                    className="absolute inset-0 block h-full w-full object-contain"
                  />
                  {stickerLayers.map((layer) => {
                    const isSelected =
                      layer.id === selectedStickerId && stickerSelected;
                    return (
                      <div
                        key={layer.id}
                        data-sticker-id={layer.id}
                        data-sticker-ui="true"
                        className="absolute"
                        style={{
                          left: `${(layer.geo.cx / layout.canvas.w) * 100}%`,
                          top: `${(layer.geo.cy / layout.canvas.h) * 100}%`,
                          width: `${((STICKER_ART.w * layer.geo.scale) / layout.canvas.w) * 100}%`,
                          aspectRatio: `${STICKER_ART.w} / ${STICKER_ART.h}`,
                          transform: `translate(-50%, -50%) rotate(${layer.geo.rotation}deg)`,
                          zIndex: isSelected ? 20 : 10,
                        }}
                      >
                        <button
                          type="button"
                          aria-label={`Stiker ${layer.preset.name}. Geser untuk memindahkan, cubit dengan dua jari untuk mengubah ukuran dan memutar, atau pakai tombol panah.`}
                          title="Geser untuk memindahkan · cubit untuk mengubah ukuran dan memutar"
                          onPointerDown={(event) =>
                            startStickerPointer(layer.id, event)
                          }
                          onPointerMove={moveStickerPointer}
                          onPointerUp={endStickerPointer}
                          onPointerCancel={endStickerPointer}
                          onKeyDown={(event) => nudgeSticker(layer.id, event)}
                          onFocus={() => {
                            setSelectedStickerId(layer.id);
                            setStickerSelected(true);
                          }}
                          className={`absolute inset-0 touch-none rounded-[10px] bg-transparent p-0 ${
                            isSelected
                              ? draggingSticker
                                ? "cursor-grabbing outline-2 outline-offset-2 outline-dashed outline-ink/70"
                                : "cursor-grab outline-2 outline-offset-2 outline-dashed outline-ink/60 hover:outline-ink/80"
                              : "cursor-grab hover:outline-2 hover:outline-offset-2 hover:outline-dashed hover:outline-ink/40"
                          }`}
                          style={{ minHeight: 0, minWidth: 0 }}
                        >
                          <StickerCanvas stickerKey={layer.key} />
                        </button>
                        {isSelected && (
                          <>
                            <span
                              role="presentation"
                              aria-hidden="true"
                              title="Putar stiker · tahan Shift untuk sudut 15°"
                              onPointerDown={(event) =>
                                startStickerHandle(layer.id, "rotate", event)
                              }
                              onPointerMove={moveStickerHandle}
                              onPointerUp={endStickerHandle}
                              onPointerCancel={endStickerHandle}
                              className="absolute -top-10 left-1/2 grid size-9 -translate-x-1/2 touch-none place-items-center rounded-full border-2 border-ink bg-butter text-ink shadow-lift-1 hover:bg-[var(--mix-coral)]"
                            >
                              <IconRotate
                                size={16}
                                stroke={2.6}
                                aria-hidden="true"
                              />
                            </span>
                            <span
                              role="presentation"
                              aria-hidden="true"
                              title="Ubah ukuran stiker"
                              onPointerDown={(event) =>
                                startStickerHandle(layer.id, "scale", event)
                              }
                              onPointerMove={moveStickerHandle}
                              onPointerUp={endStickerHandle}
                              onPointerCancel={endStickerHandle}
                              className="absolute -right-4 -bottom-4 grid size-9 touch-none place-items-center rounded-full border-2 border-ink bg-mint text-ink shadow-lift-1 hover:bg-sky"
                            >
                              <IconArrowsDiagonal2
                                size={16}
                                stroke={2.6}
                                aria-hidden="true"
                              />
                            </span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  className="mx-auto grid w-full place-items-center bg-sunken text-ink-meta"
                  style={{
                    aspectRatio: `${layout.canvas.w} / ${layout.canvas.h}`,
                    maxWidth: `calc(${(PREVIEW_HEIGHT_VH * layout.canvas.w) / layout.canvas.h}vh)`,
                    borderRadius: "calc(var(--card-radius) - 8px)",
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
                  ·{" "}
                  {stickers.length === 0
                    ? "Tanpa"
                    : stickers.length === 1
                      ? STICKERS[stickers[0].key].name
                      : `${stickers.length} di foto`}
                </span>
              </legend>
              <p className="mt-2 text-small text-ink-body">
                Ketuk stiker untuk menambah ke foto. Setiap stiker bisa digeser
                sendiri di pratinjau, dicubit dua jari, atau diatur lewat kenop
                dan slider di bawah.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2.5">
                {STICKER_KEYS.map((key) => (
                  <StickerOption
                    key={key}
                    stickerKey={key}
                    selected={selectedLayer?.key === key}
                    count={stickers.filter((item) => item.key === key).length}
                    onSelect={() => addSticker(key)}
                  />
                ))}
              </div>
              {stickers.length > 0 && (
                <button
                  type="button"
                  onClick={clearStickers}
                  className="pressable mt-3 inline-flex items-center gap-2 rounded-[var(--radius-pill)] border-2 border-ink bg-elev px-3 py-1.5 font-display text-label font-bold tracking-[0.08em] text-ink uppercase shadow-lift-1 hover:bg-pink"
                >
                  <IconTrash size={14} stroke={2.5} aria-hidden="true" />
                  Bersihkan semua
                </button>
              )}
              {selectedLayer && (
                <div
                  role="group"
                  aria-label={`Atur stiker ${selectedLayer.preset.name}`}
                  data-sticker-ui="true"
                  className="mt-4 grid gap-4 rounded-[var(--radius-lg)] border-2 border-ink bg-sunken p-4 shadow-lift-1"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-display text-label font-extrabold tracking-[0.1em] text-ink uppercase">
                      Atur stiker
                    </p>
                    <span className="font-display text-label font-bold tracking-[0.08em] text-ink-meta uppercase">
                      {selectedLayer.preset.name}
                    </span>
                  </div>
                  {stickers.length > 1 && (
                    <div
                      role="group"
                      aria-label="Pilih stiker"
                      className="grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-2"
                    >
                      {stickerLayers.map((layer, index) => {
                        const active = layer.id === selectedLayer.id;
                        return (
                          <button
                            key={layer.id}
                            type="button"
                            aria-pressed={active}
                            aria-label={`Pilih stiker ${index + 1}: ${layer.preset.name}`}
                            onClick={() => {
                              setSelectedStickerId(layer.id);
                              setStickerSelected(true);
                            }}
                            className={`pressable inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-[var(--radius-pill)] border-2 border-ink px-2.5 font-display text-label font-bold tracking-[0.04em] shadow-lift-1 ${
                              active
                                ? "bg-butter text-ink"
                                : "bg-elev text-ink hover:bg-butter/50"
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className="text-[11px] tabular-nums text-ink-meta"
                            >
                              {index + 1}
                            </span>
                            <span className="truncate">{layer.preset.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div>
                    <div className="flex items-baseline justify-between gap-3">
                      <label
                        htmlFor="sticker-scale"
                        className="font-display text-label font-extrabold tracking-[0.1em] text-ink uppercase"
                      >
                        Ukuran
                      </label>
                      <span className="font-display text-small font-bold tabular-nums text-ink">
                        {Math.round((selectedLayer.spot?.scale ?? 1) * 100)}%
                      </span>
                    </div>
                    <input
                      id="sticker-scale"
                      type="range"
                      min={STICKER_SCALE_MIN * 100}
                      max={STICKER_SCALE_MAX * 100}
                      step={1}
                      value={Math.round((selectedLayer.spot?.scale ?? 1) * 100)}
                      onChange={(event) =>
                        setStickerScaleValue(
                          selectedLayer.id,
                          Number(event.target.value),
                        )
                      }
                      className="mt-2 block w-full accent-[var(--pink)]"
                    />
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between gap-3">
                      <label
                        htmlFor="sticker-rotation"
                        className="font-display text-label font-extrabold tracking-[0.1em] text-ink uppercase"
                      >
                        Putaran
                      </label>
                      <span className="font-display text-small font-bold tabular-nums text-ink">
                        {Math.round(
                          normalizeDegrees(
                            selectedLayer.preset.rotation +
                              (selectedLayer.spot?.rotation ?? 0),
                          ),
                        )}
                        °
                      </span>
                    </div>
                    <input
                      id="sticker-rotation"
                      type="range"
                      min={-180}
                      max={180}
                      step={1}
                      value={Math.round(
                        normalizeDegrees(
                          selectedLayer.preset.rotation +
                            (selectedLayer.spot?.rotation ?? 0),
                        ),
                      )}
                      onChange={(event) =>
                        setStickerRotationValue(
                          selectedLayer.id,
                          Number(event.target.value),
                        )
                      }
                      className="mt-2 block w-full accent-[var(--pink)]"
                    />
                  </div>
                  <div className="grid gap-2 sm:flex sm:flex-wrap">
                    <button
                      type="button"
                      onClick={() => resetSticker(selectedLayer.id)}
                      className="pressable inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-pill)] border-2 border-ink bg-elev px-4 py-2 font-display text-small font-bold text-ink shadow-lift-1 hover:bg-butter sm:w-auto"
                    >
                      <IconRestore size={16} stroke={2.5} aria-hidden="true" />
                      Atur ulang
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSticker(selectedLayer.id)}
                      className="pressable inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-pill)] border-2 border-ink bg-pink px-4 py-2 font-display text-small font-bold text-ink shadow-lift-1 hover:bg-[var(--mix-coral)] sm:w-auto"
                    >
                      <IconTrash size={16} stroke={2.5} aria-hidden="true" />
                      {stickers.length > 1 ? "Hapus yang ini" : "Hapus stiker"}
                    </button>
                  </div>
                </div>
              )}
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
                  bisa dilihat semua orang di galeri StripSnap. Biarkan
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
          onClose={() => setBackDialogOpen(false)}
          actions={[
            ...(draft.source === "upload"
              ? ([
                  {
                    label: "Simpan draft & atur foto",
                    description:
                      "Foto, urutan, zoom, stiker, dan frame tetap ada di halaman foto, jadi bisa dirapikan dulu sebelum lanjut lagi.",
                    icon: (
                      <IconDeviceFloppy
                        size={20}
                        stroke={2.5}
                        aria-hidden="true"
                      />
                    ),
                    tone: "primary",
                    onClick: saveDraftAndBack,
                  },
                ] satisfies ConfirmAction[])
              : []),
            {
              label: "Buang foto & kembali",
              description:
                draft.source === "upload"
                  ? "Pilihan foto dan pengaturannya dihapus, halaman foto mulai kosong."
                  : "Foto dihapus, booth mulai lagi dengan sesi kosong.",
              icon: <IconTrash size={20} stroke={2.5} aria-hidden="true" />,
              tone: "danger",
              onClick: () => confirmBackToBooth(),
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
