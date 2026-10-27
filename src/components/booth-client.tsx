"use client";

import {
  IconAdjustmentsHorizontal,
  IconArrowBackUp,
  IconArrowLeft,
  IconArrowRight,
  IconCamera,
  IconCheck,
  IconLayoutGrid,
  IconPalette,
  IconPhoto,
  IconRefresh,
  IconReplace,
  IconTrash,
  IconVideo,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  COUNTDOWN_FROM,
  COUNTDOWN_STEP_MS,
  cameraErrorMessage,
  captureAspect,
  captureFailedMessage,
  describeCameraError,
  grabFrameWhenReady,
  nextPaint,
  sleepUntil,
  stopStream,
  waitForVideoLive,
} from "@/lib/capture";
import { BOOTH_KEY, clearBoothRun, writeDraft } from "@/lib/draft-store";
import { LAYOUTS, LAYOUT_ORDER, type LayoutType } from "@/lib/layouts";
import {
  deleteRunClips,
  isLivePhotoSupported,
  startForShot,
  storeClip,
  type LiveClip,
} from "@/lib/live-photo";
import {
  IMPORT_ACCEPT,
  importPhoto,
  photoImportMessage,
} from "@/lib/photo-import";
import {
  DEFAULT_SHOT_TRANSFORM,
  normalizeShotTransform,
  type ShotTransform,
} from "@/lib/photo-transform";
import { BackLink } from "@/components/back-link";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LayoutPreview } from "@/components/layout-preview";
import { Logo } from "@/components/logo";
import { PhotoCropper } from "@/components/photo-cropper";
import { PhotoThumb } from "@/components/photo-thumb";
import { SiteFooter } from "@/components/site-footer";

type BoothSource = "camera" | "upload";

type BoothRun = {
  layoutType: LayoutType;
  shots: string[];
  source?: BoothSource;
  transforms?: ShotTransform[];
};

/** Event slugs and access keys are `[a-z0-9-]`; anything else cannot be a real
 *  segment, so a crafted `from` cannot smuggle `//host` or `..` into the href. */
const SAFE_SEGMENT = /^[a-z0-9][a-z0-9-]*$/;

const MAX_SHOT_COUNT = Math.max(
  ...LAYOUT_ORDER.map((type) => LAYOUTS[type].shotCount),
);

/** Layouts ordered by photo capacity, so uploads can pick the tightest fit
 *  without depending on the public picker's display order. */
const LAYOUTS_BY_CAPACITY = [...LAYOUT_ORDER].sort(
  (a, b) => LAYOUTS[a].shotCount - LAYOUTS[b].shotCount,
);

/** Pick the smallest layout that can hold `count` photos. Uploads use this so a
 *  two- or three-photo selection gets the matching frame set instead of being
 *  left in the four-slot default, while four files still grow to Strip 4. */
function layoutForShotCount(count: number): LayoutType {
  const fit = Math.min(Math.max(count, 1), MAX_SHOT_COUNT);
  return (
    LAYOUTS_BY_CAPACITY.find((type) => LAYOUTS[type].shotCount >= fit) ??
    "STRIP_4"
  );
}

/** Pick the upload layout without overriding an explicit four-photo choice.
 *  Two and three photos always use their exact strip so the matching admin
 *  frames are available, while four photos keep a chosen Strip 4 or Grid 2x2. */
function layoutForUploadCount(
  current: LayoutType,
  count: number,
): LayoutType {
  const fit = Math.min(Math.max(count, 1), MAX_SHOT_COUNT);
  if (fit <= 1) return current;
  if (fit <= 3) return layoutForShotCount(fit);
  return LAYOUTS[current].shotCount === 4 ? current : layoutForShotCount(4);
}

function resolveBackTarget(from: string | undefined): { href: string; label: string } {
  if (from) {
    const [kind, value] = from.split("/");
    if (kind === "e" && value && SAFE_SEGMENT.test(value)) {
      return { href: `/e/${value}`, label: "Event" };
    }
    if (kind === "p" && value && SAFE_SEGMENT.test(value)) {
      return { href: `/p/${value}`, label: "Foto" };
    }
    if (kind === "studio" && !value) {
      return { href: "/studio", label: "Studio" };
    }
  }
  return { href: "/", label: "Beranda" };
}

type Status =
  | "intro"
  | "requesting"
  | "ready"
  | "countdown"
  | "burst"
  | "review"
  | "upload"
  | "error";

type BoothDialog = "foto" | "studio" | "layout" | null;

export function BoothClient({
  eventId,
  from,
  initialMode = "camera",
}: {
  eventId?: string;
  from?: string;
  initialMode?: BoothSource;
}) {
  const router = useRouter();
  const back = resolveBackTarget(from);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importRunRef = useRef(0);
  // Which run currently owns the live stream. A cancelled run must not stop a
  // stream that a newer run has taken over.
  const streamOwnerRef = useRef(0);
  // StrictMode runs the mount effect's cleanup once in development, right after
  // the first mount. Bumping runRef there used to invalidate a camera request
  // the guest had just started, leaving the booth stuck on "Menunggu izin
  // kamera". Track real unmounts separately so only navigation cancels work.
  const mountedRef = useRef(true);

  const [status, setStatus] = useState<Status>(
    initialMode === "upload" ? "upload" : "intro",
  );
  const [source, setSource] = useState<BoothSource>(initialMode);
  const [layoutType, setLayoutType] = useState<LayoutType>(
    initialMode === "upload" ? "STRIP_4" : "STRIP_3",
  );
  const [countdown, setCountdown] = useState<number | null>(null);
  const [shotIndex, setShotIndex] = useState<number | null>(null);
  const [shots, setShots] = useState<string[]>([]);
  const [transforms, setTransforms] = useState<ShotTransform[]>([]);
  const replaceIndexRef = useRef<number | null>(null);
  const [cropIndex, setCropIndex] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<"camera" | "capture" | null>(null);
  const [aspect, setAspect] = useState(4 / 3);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [dialog, setDialog] = useState<BoothDialog>(null);

  const [liveEnabled, setLiveEnabled] = useState(false);
  const liveSupported = isLivePhotoSupported();
  const liveRunIdRef = useRef<string | null>(null);
  const liveMetaRef = useRef<{ slot: number; mime: string; durationMs: number }[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("snapvibe.live");
      if (stored === "1") setLiveEnabled(true);
    } catch {}
  }, []);

  function toggleLive() {
    setLiveEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem("snapvibe.live", next ? "1" : "0"); } catch {}
      return next;
    });
  }

  // The booth keeps its run in memory only, so a back/forward (an accidental
  // tap, a browser swipe) silently discarded the layout choice and every photo
  // already taken. Mirroring the run to sessionStorage makes that navigation
  // non-destructive. The first pass restores instead of persisting, otherwise
  // the persist would delete the key it is about to read.
  const firstRunRef = useRef(true);
  /* eslint-disable react-hooks/set-state-in-effect -- seeding from a
     persisted run has no render-time source; this is one-time hydration. */
  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false;
      try {
        const raw = sessionStorage.getItem(BOOTH_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as BoothRun;
          if (Array.isArray(parsed?.shots) && parsed.shots.length > 0) {
            if (parsed.layoutType) setLayoutType(parsed.layoutType);
            const restoredSource: BoothSource =
              parsed.source === "upload" ? "upload" : "camera";
            setSource(restoredSource);
            setShots(parsed.shots);
            setTransforms(
              restoredSource === "upload"
                ? parsed.shots.map((_, index) =>
                    normalizeShotTransform(parsed.transforms?.[index]),
                  )
                : [],
            );
            setStatus(restoredSource === "upload" ? "upload" : "review");
          } else {
            sessionStorage.removeItem(BOOTH_KEY);
          }
        }
      } catch {
        sessionStorage.removeItem(BOOTH_KEY);
      }
      return;
    }

    try {
      if (shots.length === 0) {
        sessionStorage.removeItem(BOOTH_KEY);
        return;
      }
      sessionStorage.setItem(
        BOOTH_KEY,
        JSON.stringify({ layoutType, shots, source, transforms }),
      );
    } catch {
      // Storage can be full or blocked; the run still works in memory.
    }
  }, [layoutType, shots, source, transforms]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const preset = LAYOUTS[layoutType];
  const showPreview =
    status === "ready" || status === "countdown" || status === "burst";

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  // The video element stays mounted across states, so the stream is attached
  // here once both the ref and the stream exist.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    // Assigning srcObject again restarts the media pipeline, and this effect
    // also runs on every status change. The burst grabs a frame right after
    // flipping to "burst", so an unconditional reassignment is what let a
    // frame be captured before the element had decoded one.
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    void video
      .play()
      .then(() => setAspect(captureAspect(video.videoWidth, video.videoHeight)))
      .catch(() => undefined);
  }, [stream, status]);

  const startCamera = useCallback(async () => {
    const run = ++runRef.current;
    importRunRef.current += 1;
    setSource("camera");
    setStatus("requesting");
    setShots([]);
    setTransforms([]);
    setImporting(false);
    setImportError(null);
    setImportNotice(null);
    replaceIndexRef.current = null;
    setCropIndex(null);
    setErrorText(null);
    setErrorKind(null);
    setCountdown(null);
    setShotIndex(null);

    if (!window.isSecureContext) {
      setErrorText(cameraErrorMessage("insecure"));
      setErrorKind("camera");
      setStatus("error");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorText(cameraErrorMessage("unavailable"));
      setErrorKind("camera");
      setStatus("error");
      return;
    }

    // Release the previous stream before asking for a new one. Some devices
    // refuse a second stream while the first is still open, and this also
    // guarantees the run cannot accidentally reuse a stale camera.
    if (streamRef.current) {
      streamOwnerRef.current = 0;
      stopStream(streamRef.current);
      streamRef.current = null;
      setStream(null);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      // The permission prompt can still be open when the guest navigates away.
      // Without this guard the late resolution overwrites the screen they chose
      // and drops them back into the camera they just left. A newer run also
      // owns the camera now, so this one must release its stream.
      if (!mountedRef.current || runRef.current !== run) {
        stopStream(stream);
        return;
      }
      streamOwnerRef.current = 0;
      streamRef.current = stream;
      setStream(stream);
      setStatus("ready");
    } catch (error) {
      if (!mountedRef.current || runRef.current !== run) return;
      setErrorText(describeCameraError(error).message);
      setErrorKind("camera");
      setStatus("error");
    }
  }, []);

  const runSession = useCallback(async () => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    const shotCount = preset.shotCount;
    const run = ++runRef.current;
    const isCurrent = () => mountedRef.current && runRef.current === run;
    streamOwnerRef.current = run;

    setShots([]);
    setErrorText(null);
    setErrorKind(null);
    setStatus("countdown");

    const runId = liveEnabled && liveSupported ? crypto.randomUUID() : null;
    liveRunIdRef.current = runId;
    liveMetaRef.current = [];
    const recorderHandles: { stop(): Promise<LiveClip | null>; cancel(): void }[] = [];

    const taken: string[] = [];
    try {
      const live = await waitForVideoLive(video);
      if (!isCurrent()) return;
      if (!live) {
        setShots([]);
        setErrorText(captureFailedMessage(shotCount));
        setErrorKind("capture");
        setStatus("error");
        return;
      }

      for (let shot = 0; shot < shotCount; shot += 1) {
        setShotIndex(shot);

        setStatus("countdown");
        const endAt = performance.now() + COUNTDOWN_FROM * COUNTDOWN_STEP_MS;
        let recorderHandle: { stop(): Promise<LiveClip | null>; cancel(): void } | null = null;
        for (let n = COUNTDOWN_FROM; n >= 1; n -= 1) {
          setCountdown(n);
          if (n === 2 && runId) {
            recorderHandle = startForShot(stream);
          }
          await sleepUntil(endAt - (n - 1) * COUNTDOWN_STEP_MS);
          if (!isCurrent()) return;
        }

        setCountdown(null);
        setStatus("burst");
        await nextPaint();
        const frame = await grabFrameWhenReady(video);
        if (!frame) {
          if (runId && recorderHandle) recorderHandle.cancel();
          setShots([]);
          setErrorText(captureFailedMessage(shotCount));
          setErrorKind("capture");
          setStatus("error");
          return;
        }
        taken.push(frame);

        if (runId && recorderHandle) {
          const handle = recorderHandle;
          await sleepUntil(performance.now() + 1200);
          if (!isCurrent()) { handle.cancel(); return; }
          const clip = await handle.stop();
          if (clip) {
            await storeClip(runId, shot, clip);
            liveMetaRef.current.push({ slot: shot, mime: clip.mime, durationMs: clip.durationMs });
          }
        }
      }

      if (runId) {
        // clips already stored per-shot
      }
    } catch {
      setShots([]);
      setErrorText(captureFailedMessage(shotCount));
      setErrorKind("capture");
      setStatus("error");
      return;
    } finally {
      if (streamOwnerRef.current === run) {
        stopStream(stream);
        if (streamRef.current === stream) streamRef.current = null;
      }
    }

    if (!isCurrent()) return;
    setShotIndex(null);
    setShots(taken);
    setStatus("review");
  }, [preset.shotCount, liveEnabled, liveSupported]);

  function cancelRun() {
    runRef.current += 1;
    setCountdown(null);
    setShotIndex(null);
    if (liveRunIdRef.current) {
      void deleteRunClips(liveRunIdRef.current);
      liveRunIdRef.current = null;
      liveMetaRef.current = [];
    }
  }

  function retake() {
    cancelRun();
    setShots([]);
    setTransforms([]);
    startCamera();
  }

  function backToLayout() {
    cancelRun();
    importRunRef.current += 1;
    setShots([]);
    setTransforms([]);
    setSource("camera");
    setStatus("intro");
    setImporting(false);
    setImportError(null);
    setImportNotice(null);
    replaceIndexRef.current = null;
    setCropIndex(null);
    setErrorText(null);
    setErrorKind(null);
    try {
      sessionStorage.removeItem(BOOTH_KEY);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  }

  function openPicker(index: number | null = null) {
    replaceIndexRef.current = index;
    setImportError(null);
    setImportNotice(null);
    const input = fileInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  }

  async function handleFiles(files: File[] | null) {
    if (!files || files.length === 0) return;

    const list = files;
    const replaceAt = replaceIndexRef.current;
    replaceIndexRef.current = null;

    // Match the layout to the number of photos selected, not just grow when the
    // current one is full. A two-photo upload therefore opens Strip 2 and sees
    // its two-photo frames, and three photos move to Strip 3. Four photos keep
    // an explicitly chosen Strip 4 or Grid 2x2. Single-photo uploads keep the
    // existing Single shortcut.
    const nextCount = shots.length + list.length;
    const targetType =
      replaceAt === null
        ? layoutForUploadCount(layoutType, nextCount)
        : layoutType;
    const targetPreset = LAYOUTS[targetType];
    const room =
      replaceAt !== null
        ? 1
        : Math.max(0, targetPreset.shotCount - shots.length);
    if (replaceAt === null && room === 0) {
      setImportNotice("Semua slot sudah terisi. Hapus atau ganti salah satu foto dulu.");
      return;
    }

    const accepted =
      replaceAt !== null ? list.slice(0, 1) : list.slice(0, room);

    setImportNotice(null);
    setImportError(null);
    setImporting(true);
    setSource("upload");
    setStatus("upload");
    const run = ++importRunRef.current;
    const nextShots = [...shots];
    const nextTransforms = [...transforms];
    const failures: string[] = [];

    try {
      for (const file of accepted) {
        if (!mountedRef.current || importRunRef.current !== run) return;
        try {
          const imported = await importPhoto(file);
          if (!mountedRef.current || importRunRef.current !== run) return;
          if (replaceAt !== null && replaceAt < nextShots.length) {
            nextShots[replaceAt] = imported.dataUrl;
            nextTransforms[replaceAt] = { ...DEFAULT_SHOT_TRANSFORM };
          } else {
            nextShots.push(imported.dataUrl);
            nextTransforms.push({ ...DEFAULT_SHOT_TRANSFORM });
          }
        } catch (error) {
          failures.push(`${file.name}: ${photoImportMessage(error)}`);
        }
      }

      if (!mountedRef.current || importRunRef.current !== run) return;
      // Import failures can leave fewer photos than selected, so fit the layout
      // to what was actually imported.
      const finalLayoutType =
        replaceAt === null
          ? layoutForUploadCount(layoutType, nextShots.length)
          : layoutType;
      setShots(nextShots);
      setLayoutType(finalLayoutType);
      setTransforms(
        nextShots.map((_, index) =>
          normalizeShotTransform(nextTransforms[index]),
        ),
      );
      if (failures.length > 0) setImportError(failures.join(" "));
      if (replaceAt === null && list.length > accepted.length) {
        setImportNotice(`Cuma ${accepted.length} foto pertama yang dipakai.`);
      } else if (replaceAt === null && finalLayoutType !== layoutType) {
        setImportNotice(
          `Layout diganti ke ${LAYOUTS[finalLayoutType].label} supaya semua foto muat.`,
        );
      }
    } finally {
      if (mountedRef.current && importRunRef.current === run) {
        setImporting(false);
      }
    }
  }

  function removeShot(index: number) {
    if (importing) return;
    const nextShots = shots.filter((_, i) => i !== index);
    setShots(nextShots);
    setTransforms((current) => current.filter((_, i) => i !== index));
    // Removing a photo should hand back the matching frame set too. Leave a
    // lone photo in place so the existing Single shortcut can offer its layout.
    if (nextShots.length >= 2) {
      setLayoutType(layoutForShotCount(nextShots.length));
    }
    setCropIndex(null);
  }

  function moveShot(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= shots.length) return;
    setShots((current) => {
      if (target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setTransforms((current) => {
      if (target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function updateTransform(index: number, value: ShotTransform) {
    setTransforms((current) =>
      current.map((transform, i) => (i === index ? value : transform)),
    );
    setCropIndex(null);
  }

  function useSingleLayout() {
    importRunRef.current += 1;
    setImporting(false);
    setLayoutType("SINGLE");
    setShots((current) => current.slice(0, 1));
    setTransforms((current) => current.slice(0, 1));
    setSource("upload");
    setStatus("upload");
    setImportError(null);
    setImportNotice(null);
  }

  function proceed() {
    const required = preset.shotCount;
    if (shots.length < required) return;
    const finalShots = shots.slice(0, required);
    const finalTransforms =
      source === "upload"
        ? finalShots.map((_, index) =>
            normalizeShotTransform(transforms[index]),
          )
        : undefined;

    const liveMeta = liveRunIdRef.current && liveMetaRef.current.length > 0
      ? { runId: liveRunIdRef.current, slots: liveMetaRef.current }
      : undefined;

    try {
      sessionStorage.removeItem(BOOTH_KEY);
    } catch {
      // A blocked storage does not affect the in-memory draft handoff.
    }
    writeDraft({
      shots: finalShots,
      layoutType,
      eventId: eventId ?? null,
      source,
      ...(finalTransforms ? { transforms: finalTransforms } : {}),
      ...(liveMeta ? { live: liveMeta } : {}),
    });
    router.push("/studio");
  }

  const possibleSingleShortcut =
    source === "upload" &&
    preset.shotCount > 1 &&
    shots.length === 1 &&
    !importing;
  const canContinue = shots.length >= preset.shotCount;
  const canAddMore =
    source === "upload" &&
    shots.length < MAX_SHOT_COUNT &&
    (shots.length < preset.shotCount ||
      layoutForShotCount(shots.length + 1) !== layoutType);

  /** The header back link only needs a gate when it leaves the booth for the
   *  result or the studio; Beranda and Event stay one-tap. */
  function requestLeave(event: React.MouseEvent<HTMLAnchorElement>) {
    if (back.label !== "Foto" && back.label !== "Studio") return;
    // Keep modifier/middle clicks as ordinary "open elsewhere" actions; only a
    // plain click is about to drop this booth run in this tab.
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    setDialog(back.label === "Foto" ? "foto" : "studio");
  }

  function requestLayoutChange() {
    if (shots.length === 0) {
      backToLayout();
      return;
    }
    setDialog("layout");
  }

  function confirmLeaveToPhoto() {
    setDialog(null);
    clearBoothRun();
    router.push(back.href);
  }

  function confirmGoToStudio() {
    setDialog(null);
    if (canContinue) {
      proceed();
      return;
    }
    clearBoothRun();
    router.push("/studio");
  }

  const studioDialogDescription = canContinue
    ? "Foto di booth ini siap dibawa ke studio. Kamu bisa atur filter, stiker, dan frame di sana."
    : shots.length > 0
      ? "Sesi ini belum lengkap. Membuka studio akan menutup sesi booth dan menampilkan draft terakhir."
      : "Belum ada foto baru di booth ini. Studio akan menampilkan draft terakhir kalau ada.";

  const fotoDialogDescription =
    shots.length === 0
      ? "Sesi booth ini akan ditutup. Foto yang sudah tersimpan di halaman hasil tetap aman."
      : source === "upload"
        ? "Foto baru di sesi ini akan ditutup. Foto yang sudah tersimpan di halaman hasil tetap aman."
        : "Bidikan baru di sesi ini akan ditutup. Foto yang sudah tersimpan di halaman hasil tetap aman.";
  const uploadGridClass =
    preset.shotCount === 1
      ? "mx-auto w-full max-w-md grid-cols-1"
      : preset.shotCount === 2
        ? "mx-auto w-full max-w-3xl grid-cols-1 sm:grid-cols-2"
        : preset.shotCount === 3
          ? "grid-cols-1 sm:grid-cols-3"
          : "grid-cols-2 sm:grid-cols-4";
  const cropShot = cropIndex !== null ? shots[cropIndex] : undefined;

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

          <div className="flex items-center gap-2 sm:gap-3">
            <BackLink
              href={back.href}
              label={back.label}
              onClick={
                back.label === "Foto" || back.label === "Studio"
                  ? requestLeave
                  : undefined
              }
            />
            {status !== "intro" && (
              <button
                type="button"
                onClick={requestLayoutChange}
                aria-label="Ganti layout"
                className="pressable inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-pill)] border-2 border-ink bg-elev px-3.5 py-1.5 font-display text-label font-bold tracking-[0.1em] text-ink uppercase shadow-lift-1"
              >
                <IconArrowBackUp size={18} stroke={2.5} aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Layout</span>
              </button>
            )}
            <span className="hidden items-center gap-2 rounded-[var(--radius-pill)] border-2 border-ink bg-butter px-4 py-1.5 font-display text-label font-extrabold tracking-[0.12em] text-ink uppercase sm:inline-flex">
              <IconCamera size={16} stroke={2.5} aria-hidden="true" />
              Booth
            </span>
            <span className="hidden shrink-0 items-center gap-2 rounded-[var(--radius-pill)] border-2 border-ink bg-mint px-4 py-1.5 font-display text-label font-bold tracking-[0.12em] text-ink uppercase sm:inline-flex">
              {source === "upload" ? (
                <IconPhoto size={16} stroke={2.5} aria-hidden="true" />
              ) : (
                <IconCamera size={16} stroke={2.5} aria-hidden="true" />
              )}
              {preset.shotCount} {source === "upload" ? "foto" : "bidikan"}
            </span>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <div
          className={`shell flex flex-1 flex-col justify-center pt-[var(--page)] pb-6 ${
            showPreview ? "" : "hidden"
          }`}
        >
          {showPreview && <h1 className="sr-only">Booth kamera</h1>}
          <div className="mx-auto w-full max-w-3xl">
            <div
              className="relative w-full overflow-hidden rounded-[var(--radius-xl)] border-2 border-ink bg-board shadow-lift-3"
              style={{ aspectRatio: `${aspect}`, transform: "rotate(-0.8deg)" }}
            >
              {/* Selfie-style preview: the guest sees themselves as in a
                  mirror. `grabFrame` applies the same flip, so the saved photo
                  matches this view. */}
              <video
                ref={videoRef}
                playsInline
                muted
                className="size-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
              {countdown !== null && (
                <div className="absolute inset-0 grid place-items-center">
                  <span
                    key={countdown}
                    data-testid="countdown"
                    className="pop-count grid size-28 place-items-center rounded-full border-2 border-ink bg-butter font-display text-display font-extrabold text-ink shadow-lift-2"
                  >
                    {countdown}
                  </span>
                  {shotIndex !== null && (
                    <span
                      data-testid="shot-progress"
                      className="absolute bottom-6 rounded-[var(--radius-pill)] border-2 border-ink bg-mint px-4 py-1.5 font-display text-label font-bold tracking-[0.12em] text-ink uppercase"
                    >
                      Bidikan {shotIndex + 1} / {preset.shotCount}
                    </span>
                  )}
                </div>
              )}
              {status === "burst" && (
                <div
                  data-testid="burst"
                  className="ink-splat-in absolute inset-x-4 bottom-4 rounded-[var(--radius-pill)] border-2 border-ink bg-mint px-4 py-2.5 text-center font-display text-label font-extrabold tracking-[0.14em] text-ink uppercase shadow-lift-1"
                >
                  Jepret!
                </div>
              )}
            </div>
          </div>
        </div>
        {status === "intro" && (
          <div className="shell flex flex-1 flex-col justify-center py-[var(--page)]">
            <h1 className="text-display font-extrabold">Pilih layout</h1>
            <p className="mt-4 max-w-[var(--measure)] text-lead text-ink-body">
              Pilih layout, lalu jepret atau unggah foto dari galeri. Kamu bisa
              ganti foto sebanyak yang kamu mau sebelum menyimpan.
            </p>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {LAYOUT_ORDER.map((key, index) => {
                const layout = LAYOUTS[key];
                const active = key === layoutType;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setLayoutType(key)}
                    aria-pressed={active}
                    className={`pressable rounded-[var(--radius-lg)] border-2 p-5 text-left ${
                      active
                        ? "border-ink bg-butter shadow-lift-2"
                        : "border-ink bg-elev shadow-lift-1 hover:bg-butter/50"
                    }`}
                  >
                    <div className="flex h-44 items-center justify-center overflow-hidden rounded-[10px] border-2 border-ink bg-sunken p-3">
                      <div
                        style={{
                          aspectRatio: `${layout.canvas.w} / ${layout.canvas.h}`,
                          height: "100%",
                          transform: `rotate(${index % 2 === 0 ? -1 : 1}deg)`,
                        }}
                      >
                        <LayoutPreview
                          type={key}
                          slotFill={active ? "var(--pink)" : "var(--bg-elev)"}
                          markOpacity={active ? 0.7 : 0.4}
                          decorative
                        />
                      </div>
                    </div>
                    <p
                      className={`mt-5 font-display text-h3 font-extrabold ${
                        active ? "text-ink" : "text-ink-meta"
                      }`}
                    >
                      {layout.label}
                    </p>
                    <p className="mt-1 font-display text-label font-bold tracking-[0.1em] text-ink-meta uppercase">
                      {layout.shotCount} slot
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="mt-10 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={startCamera}
                className="pressable inline-flex items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-mint px-8 py-4 font-display text-lead font-extrabold text-ink shadow-lift-2 hover:bg-sky"
              >
                <IconCamera size={24} stroke={2.5} aria-hidden="true" />
                Aktifkan kamera
              </button>
              <button
                type="button"
                onClick={() => openPicker(null)}
                className="pressable inline-flex items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-butter px-8 py-4 font-display text-lead font-extrabold text-ink shadow-lift-2 hover:bg-[var(--mix-coral)]"
              >
                <IconPhoto size={24} stroke={2.5} aria-hidden="true" />
                Unggah foto
              </button>
            </div>
          </div>
        )}

        {status === "upload" && (
          <div
            data-testid="upload-editor"
            className="shell flex flex-1 flex-col justify-center py-[var(--page)]"
          >
            <div className="max-w-[var(--measure)]">
              <h1 className="font-display text-h2 font-extrabold">Susun fotomu</h1>
              <p className="mt-3 text-lead text-ink-body">
                Pilih {preset.shotCount} foto dari galeri, bisa sampai empat.
                Kalau foto yang kamu pilih lebih banyak, layout otomatis
                menyesuaikan. Foto asli tetap di HP; hanya strip akhir yang
                diunggah nanti. Geser dan zoom tiap foto lewat tombol Atur.
              </p>
            </div>

            {importing && (
              <p
                role="status"
                className="mt-5 max-w-[var(--measure)] rounded-[var(--radius)] border-2 border-ink bg-butter px-4 py-3 text-small font-bold text-ink"
              >
                Memproses foto...
              </p>
            )}
            {importError && (
              <p
                role="alert"
                className="mt-5 max-w-[var(--measure)] rounded-[var(--radius)] border-2 border-ink bg-pink px-4 py-3 text-small font-semibold text-ink"
              >
                {importError}
              </p>
            )}
            {importNotice && (
              <p
                role="status"
                className="mt-5 max-w-[var(--measure)] rounded-[var(--radius)] border-2 border-ink bg-sky px-4 py-3 text-small font-semibold text-ink"
              >
                {importNotice}
              </p>
            )}

            <div className={`mt-8 grid gap-4 ${uploadGridClass}`}>
              {Array.from({ length: preset.shotCount }, (_, index) => {
                const shot = shots[index];
                const slot = preset.slots[index];
                const slotAspect = slot.w / slot.h;
                const transform = normalizeShotTransform(transforms[index]);
                return (
                  <div
                    key={index}
                    data-testid={`upload-slot-${index}`}
                    className="flex flex-col rounded-[var(--radius)] border-2 border-ink bg-elev p-2 shadow-lift-1"
                  >
                    <div className="overflow-hidden rounded-[6px] border-2 border-ink bg-sunken">
                      {shot ? (
                        <PhotoThumb
                          src={shot}
                          aspect={slotAspect}
                          transform={transform}
                          className="block h-auto w-full"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => openPicker(index)}
                          disabled={importing}
                          className="grid w-full place-items-center bg-sunken p-3 text-center disabled:cursor-not-allowed disabled:opacity-45"
                          style={{ aspectRatio: `${slotAspect}` }}
                        >
                          <span className="inline-flex flex-col items-center gap-1.5 font-display text-label font-bold tracking-[0.1em] text-ink-meta uppercase">
                            <IconPhoto size={26} stroke={2} aria-hidden="true" />
                            Pilih foto
                          </span>
                        </button>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="px-1 font-display text-label font-extrabold tracking-[0.1em] text-ink uppercase">
                        Foto {index + 1}
                      </span>
                      {shot && (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setCropIndex(index)}
                            disabled={importing}
                            className="pressable inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-sm)] border-2 border-ink bg-butter px-3 font-display text-label font-bold tracking-[0.06em] text-ink uppercase shadow-lift-1 disabled:opacity-45"
                          >
                            <IconAdjustmentsHorizontal
                              size={18}
                              stroke={2.5}
                              aria-hidden="true"
                            />
                            Atur
                          </button>
                          <button
                            type="button"
                            onClick={() => openPicker(index)}
                            disabled={importing}
                            className="pressable inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-sm)] border-2 border-ink bg-elev px-3 font-display text-label font-bold tracking-[0.06em] text-ink uppercase shadow-lift-1 hover:bg-butter disabled:opacity-45"
                          >
                            <IconReplace size={18} stroke={2.5} aria-hidden="true" />
                            Ganti
                          </button>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => moveShot(index, -1)}
                              disabled={importing || index === 0}
                              aria-label={`Geser foto ${index + 1} ke kiri`}
                              title="Geser ke kiri"
                              className="pressable grid size-10 place-items-center rounded-[var(--radius-sm)] border-2 border-ink bg-elev text-ink shadow-lift-1 hover:bg-butter disabled:opacity-35"
                            >
                              <IconArrowLeft size={18} stroke={2.5} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveShot(index, 1)}
                              disabled={importing || index >= shots.length - 1}
                              aria-label={`Geser foto ${index + 1} ke kanan`}
                              title="Geser ke kanan"
                              className="pressable grid size-10 place-items-center rounded-[var(--radius-sm)] border-2 border-ink bg-elev text-ink shadow-lift-1 hover:bg-butter disabled:opacity-35"
                            >
                              <IconArrowRight size={18} stroke={2.5} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeShot(index)}
                              disabled={importing}
                              aria-label={`Hapus foto ${index + 1}`}
                              title="Hapus foto"
                              className="pressable grid size-10 place-items-center rounded-[var(--radius-sm)] border-2 border-ink bg-pink text-ink shadow-lift-1 hover:bg-[var(--mix-coral)] disabled:opacity-45"
                            >
                              <IconTrash size={18} stroke={2.5} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {possibleSingleShortcut && (
              <div className="mt-6 max-w-[var(--measure)] rounded-[var(--radius)] border-2 border-ink bg-sky p-4 shadow-lift-1">
                <p className="text-small font-semibold text-ink">
                  Cuma punya satu foto? Layout Single lebih pas untuk satu
                  bidikan besar.
                </p>
                <button
                  type="button"
                  onClick={useSingleLayout}
                  className="pressable mt-3 inline-flex items-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-elev px-4 py-2 font-display text-small font-bold text-ink shadow-lift-1 hover:bg-butter"
                >
                  <IconPhoto size={18} stroke={2.5} aria-hidden="true" />
                  Pakai layout Single
                </button>
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={proceed}
                disabled={!canContinue || importing}
                className="pressable inline-flex items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-pink px-7 py-4 font-display text-lead font-extrabold text-ink shadow-lift-2 hover:bg-[var(--mix-coral)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <IconCheck size={22} stroke={2.5} aria-hidden="true" />
                Lanjut ke studio
              </button>
              {(!canContinue || canAddMore) && (
                <button
                  type="button"
                  onClick={() => openPicker(null)}
                  disabled={importing}
                  className="pressable inline-flex items-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-butter px-6 py-4 font-display text-body font-bold text-ink shadow-lift-1 hover:bg-[var(--mix-coral)] disabled:opacity-45"
                >
                  <IconPhoto size={20} stroke={2.5} aria-hidden="true" />
                  Tambah foto
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShots([]);
                  setTransforms([]);
                  setImportError(null);
                  setImportNotice(null);
                }}
                disabled={importing || shots.length === 0}
                className="pressable inline-flex items-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-elev px-6 py-4 font-display text-body font-bold text-ink shadow-lift-1 hover:bg-butter disabled:opacity-45"
              >
                <IconTrash size={20} stroke={2.5} aria-hidden="true" />
                Kosongkan
              </button>
            </div>

            <p className="mt-5 flex items-center gap-2 font-display text-label font-bold tracking-[0.12em] text-ink-meta uppercase">
              <IconPhoto size={15} stroke={2.5} aria-hidden="true" />
              {shots.length} / {preset.shotCount} foto · {preset.label}
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="shell flex flex-1 flex-col justify-center py-[var(--page)]">
            <div className="max-w-[var(--measure)] rounded-[var(--radius-xl)] border-2 border-ink bg-elev p-8 shadow-lift-2">
              <span
                className="grid size-14 place-items-center rounded-[16px] border-2 border-ink bg-pink text-ink"
                aria-hidden="true"
              >
                <IconX size={28} stroke={2.5} />
              </span>
              <h1 className="mt-6 font-display text-h2 font-extrabold">
                {errorKind === "capture"
                  ? "Gagal mengambil bidikan"
                  : "Kamera belum aktif"}
              </h1>
              <p className="mt-3 text-lead text-ink-body">{errorText}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={startCamera}
                  className="pressable inline-flex items-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-mint px-6 py-3 font-display text-body font-extrabold text-ink shadow-lift-1 hover:bg-sky"
                >
                  <IconRefresh size={20} stroke={2.5} aria-hidden="true" />
                  Coba lagi
                </button>
                <button
                  type="button"
                  onClick={requestLayoutChange}
                  className="pressable inline-flex items-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-elev px-6 py-3 font-display text-body font-bold text-ink shadow-lift-1 hover:bg-butter"
                >
                  <IconLayoutGrid size={20} stroke={2.5} aria-hidden="true" />
                  Ganti layout
                </button>
                <button
                  type="button"
                  onClick={() => openPicker(null)}
                  className="pressable inline-flex items-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-butter px-6 py-3 font-display text-body font-bold text-ink shadow-lift-1 hover:bg-[var(--mix-coral)]"
                >
                  <IconPhoto size={20} stroke={2.5} aria-hidden="true" />
                  Unggah foto saja
                </button>
              </div>
            </div>
          </div>
        )}

        {(status === "ready" || status === "countdown" || status === "burst") && (
          <div className="shell flex flex-1 flex-col justify-center pb-[var(--page)]">
            <div className="mx-auto w-full max-w-3xl">
              <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="flex items-center gap-2 font-display text-label font-bold tracking-[0.12em] text-ink-meta uppercase">
                    <IconCamera size={15} stroke={2.5} aria-hidden="true" />
                    {preset.label} / {preset.shotCount} bidikan
                  </p>
                  {liveSupported && (
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={toggleLive}
                        aria-pressed={liveEnabled}
                        aria-label="Live Photo"
                        className="pressable group inline-flex items-center gap-2"
                      >
                        <span className="font-display text-label font-bold tracking-[0.1em] text-ink-meta uppercase">
                          Live
                        </span>
                        <span
                          className={`relative inline-flex h-7 w-12 items-center rounded-full border-2 border-ink shadow-lift-1 transition-colors ${
                            liveEnabled ? "bg-coral" : "bg-elev"
                          }`}
                        >
                          <span
                            className={`inline-block size-5 rounded-full border-2 border-ink bg-board shadow-sm transition-transform ${
                              liveEnabled ? "translate-x-6" : "translate-x-0.5"
                            }`}
                          />
                        </span>
                      </button>
                      <p className="flex items-center gap-1 text-[10px] font-semibold text-ink-meta">
                        <IconVideo size={11} stroke={2.5} aria-hidden="true" />
                        Rekam video per foto
                      </p>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={runSession}
                  disabled={status !== "ready"}
                  className="pressable inline-flex items-center gap-2 rounded-[var(--radius-lg)] border-2 border-ink bg-pink px-10 py-5 font-display text-h3 font-extrabold text-ink shadow-lift-3 hover:bg-[var(--mix-coral)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <IconCamera size={28} stroke={2.5} aria-hidden="true" />
                  Jepret
                </button>
              </div>
            </div>
          </div>
        )}

        {status === "review" && (
          <div data-testid="review" className="shell flex flex-1 flex-col justify-center py-[var(--page)]">
            <h1 className="font-display text-h2 font-extrabold">Ini fotomu</h1>
            <p className="mt-3 max-w-[var(--measure)] text-lead text-ink-body">
              Puas? Lanjut ke studio untuk ganti filter, tambah stiker, lalu
              simpan.
            </p>

            <div
              className={`mt-8 grid gap-4 ${
                shots.length === 1
                  ? "mx-auto w-full max-w-md grid-cols-1"
                  : shots.length === 3
                    ? "grid-cols-3"
                    : "grid-cols-2 sm:grid-cols-4"
              }`}
            >
              {shots.map((shot, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-[var(--radius)] border-2 border-ink bg-ink p-1.5 shadow-lift-2"
                  style={{ transform: `rotate(${i % 2 === 0 ? -1.5 : 1.5}deg)` }}
                >
                  <img
                    src={shot}
                    alt={`Bidikan ${i + 1}`}
                    className="aspect-3/4 w-full rounded-[6px] object-cover"
                  />
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap gap-4">
              <button
                type="button"
                onClick={proceed}
                disabled={!canContinue}
                className="pressable inline-flex items-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-pink px-7 py-4 font-display text-lead font-extrabold text-ink shadow-lift-2 hover:bg-[var(--mix-coral)] disabled:opacity-45"
              >
                <IconCheck size={22} stroke={2.5} aria-hidden="true" />
                Lanjut ke studio
              </button>
              <button
                type="button"
                onClick={retake}
                className="pressable inline-flex items-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-elev px-7 py-4 font-display text-lead font-bold text-ink shadow-lift-2 hover:bg-butter"
              >
                <IconArrowBackUp size={22} stroke={2.5} aria-hidden="true" />
                Ambil ulang
              </button>
            </div>
          </div>
        )}

        {status === "requesting" && (
          <div className="shell flex flex-1 flex-col justify-center py-[var(--page)]">
            <h1 className="sr-only">Menyiapkan kamera</h1>
            <p className="font-display text-lead font-bold text-ink-body">
              Menunggu izin kamera...
            </p>
          </div>
        )}
      </main>

      <input
        ref={fileInputRef}
        type="file"
        accept={IMPORT_ACCEPT}
        multiple
        tabIndex={-1}
        aria-hidden="true"
        data-testid="photo-input"
        className="sr-only"
        onChange={(event) => {
          const files = event.currentTarget.files
            ? Array.from(event.currentTarget.files)
            : null;
          event.currentTarget.value = "";
          void handleFiles(files);
        }}
      />

      {cropShot && cropIndex !== null && (
        <PhotoCropper
          src={cropShot}
          aspect={
            preset.slots[cropIndex]
              ? preset.slots[cropIndex].w / preset.slots[cropIndex].h
              : 1
          }
          title={`Atur foto ${cropIndex + 1}`}
          value={normalizeShotTransform(transforms[cropIndex])}
          onCancel={() => setCropIndex(null)}
          onSave={(value) => {
            if (cropIndex !== null) updateTransform(cropIndex, value);
          }}
        />
      )}

      <SiteFooter />

      {dialog === "foto" && (
        <ConfirmDialog
          open
          title="Kembali ke foto?"
          description={fotoDialogDescription}
          icon={<IconPhoto size={22} stroke={2.5} aria-hidden="true" />}
          onClose={() => setDialog(null)}
          actions={[
            {
              label: "Lihat foto",
              description: "Buka halaman hasil dan QR untuk membagikannya.",
              icon: <IconPhoto size={20} stroke={2.5} aria-hidden="true" />,
              tone: "primary",
              onClick: confirmLeaveToPhoto,
            },
            {
              label: "Batal, tetap di booth",
              icon: <IconX size={20} stroke={2.5} aria-hidden="true" />,
              tone: "neutral",
              onClick: () => setDialog(null),
            },
          ]}
        />
      )}

      {dialog === "studio" && (
        <ConfirmDialog
          open
          title="Buka studio?"
          description={studioDialogDescription}
          icon={<IconPalette size={22} stroke={2.5} aria-hidden="true" />}
          onClose={() => setDialog(null)}
          actions={[
            {
              label: canContinue ? "Bawa foto ke studio" : "Ke studio",
              description: canContinue
                ? "Filter, stiker, dan frame bisa diatur di sana."
                : undefined,
              icon: <IconPalette size={20} stroke={2.5} aria-hidden="true" />,
              tone: "primary",
              onClick: confirmGoToStudio,
            },
            {
              label: "Batal, tetap di booth",
              icon: <IconX size={20} stroke={2.5} aria-hidden="true" />,
              tone: "neutral",
              onClick: () => setDialog(null),
            },
          ]}
        />
      )}

      {dialog === "layout" && (
        <ConfirmDialog
          open
          title="Ganti layout?"
          description="Foto yang sudah diambil atau diunggah di sesi ini akan dihapus. Kamu mulai lagi dari pilihan layout."
          icon={<IconLayoutGrid size={22} stroke={2.5} aria-hidden="true" />}
          onClose={() => setDialog(null)}
          actions={[
            {
              label: "Ganti layout",
              description: "Kosongkan sesi ini dan pilih layout lain.",
              icon: (
                <IconLayoutGrid size={20} stroke={2.5} aria-hidden="true" />
              ),
              tone: "danger",
              onClick: () => {
                setDialog(null);
                backToLayout();
              },
            },
            {
              label: "Batal, tetap di sini",
              icon: <IconX size={20} stroke={2.5} aria-hidden="true" />,
              tone: "neutral",
              onClick: () => setDialog(null),
            },
          ]}
        />
      )}
    </div>
  );
}
