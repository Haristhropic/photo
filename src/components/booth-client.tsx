"use client";

import {
  IconArrowBackUp,
  IconCamera,
  IconRefresh,
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
import { writeDraft } from "@/lib/draft-store";
import { LAYOUTS, LAYOUT_ORDER, type LayoutType } from "@/lib/layouts";
import { BackLink } from "@/components/back-link";
import { LayoutPreview } from "@/components/layout-preview";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";

const BOOTH_KEY = "snapvibe.boothrun";

type BoothRun = { layoutType: LayoutType; shots: string[] };

/** Event slugs and access keys are `[a-z0-9-]`; anything else cannot be a real
 *  segment, so a crafted `from` cannot smuggle `//host` or `..` into the href. */
const SAFE_SEGMENT = /^[a-z0-9][a-z0-9-]*$/;

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

type Status = "intro" | "requesting" | "ready" | "countdown" | "burst" | "review" | "error";

export function BoothClient({
  eventId,
  from,
}: {
  eventId?: string;
  from?: string;
}) {
  const router = useRouter();
  const back = resolveBackTarget(from);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runRef = useRef(0);
  // Which run currently owns the live stream. A cancelled run must not stop a
  // stream that a newer run has taken over.
  const streamOwnerRef = useRef(0);
  // StrictMode runs the mount effect's cleanup once in development, right after
  // the first mount. Bumping runRef there used to invalidate a camera request
  // the guest had just started, leaving the booth stuck on "Menunggu izin
  // kamera". Track real unmounts separately so only navigation cancels work.
  const mountedRef = useRef(true);

  const [status, setStatus] = useState<Status>("intro");
  const [layoutType, setLayoutType] = useState<LayoutType>("STRIP_3");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [shotIndex, setShotIndex] = useState<number | null>(null);
  const [shots, setShots] = useState<string[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<"camera" | "capture" | null>(null);
  const [aspect, setAspect] = useState(4 / 3);
  const [stream, setStream] = useState<MediaStream | null>(null);

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
            setShots(parsed.shots);
            setStatus("review");
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
      sessionStorage.setItem(BOOTH_KEY, JSON.stringify({ layoutType, shots }));
    } catch {
      // Storage can be full or blocked; the run still works in memory.
    }
  }, [layoutType, shots]);
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
    setStatus("requesting");
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

    const taken: string[] = [];
    try {
      // Wait for the current stream to present a decoded, non-blank frame
      // before the first countdown. Without this, a slow camera (or a retake)
      // can expose the previous stream's frozen frame, which was then saved as
      // the "new" photo.
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
        for (let n = COUNTDOWN_FROM; n >= 1; n -= 1) {
          setCountdown(n);
          await sleepUntil(endAt - (n - 1) * COUNTDOWN_STEP_MS);
          if (!isCurrent()) return;
        }

        setCountdown(null);
        setStatus("burst");
        // grabFrame is synchronous, so without yielding React coalesces the
        // burst status away and the shutter feedback never paints.
        await nextPaint();
        const frame = await grabFrameWhenReady(video);
        if (!frame) {
          setShots([]);
          setErrorText(captureFailedMessage(shotCount));
          setErrorKind("capture");
          setStatus("error");
          return;
        }
        taken.push(frame);
      }
    } catch {
      setShots([]);
      setErrorText(captureFailedMessage(shotCount));
      setErrorKind("capture");
      setStatus("error");
      return;
    } finally {
      // The stream must stay live for every grabFrame call, so it is released
      // here instead. Only the run that still owns the stream may stop it, so
      // a cancelled run cannot kill a newer run's camera.
      if (streamOwnerRef.current === run) {
        stopStream(stream);
        if (streamRef.current === stream) streamRef.current = null;
      }
    }

    if (!isCurrent()) return;
    setShotIndex(null);
    setShots(taken);
    setStatus("review");
  }, [preset.shotCount]);

  function cancelRun() {
    runRef.current += 1;
    setCountdown(null);
    setShotIndex(null);
  }

  function retake() {
    cancelRun();
    setShots([]);
    startCamera();
  }

  function backToLayout() {
    cancelRun();
    setShots([]);
    setStatus("intro");
    setErrorText(null);
    setErrorKind(null);
    try {
      sessionStorage.removeItem(BOOTH_KEY);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  }

  function proceed() {
    if (shots.length === 0) return;
    // Free the booth snapshot before writing the draft. Both hold the same
    // photo data, and on a nearly-full sessionStorage the draft write could
    // otherwise fail with the previous run still in place.
    try {
      sessionStorage.removeItem(BOOTH_KEY);
    } catch {
      // A blocked storage does not affect the in-memory draft handoff.
    }
    writeDraft({ shots, layoutType, eventId: eventId ?? null });
    router.push("/studio");
  }

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
            <BackLink href={back.href} label={back.label} />
            {status !== "intro" && (
              <button
                type="button"
                onClick={backToLayout}
                aria-label="Ganti layout"
                className="pressable inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-pill)] border-2 border-ink bg-elev px-3.5 py-1.5 font-display text-label font-bold tracking-[0.1em] text-ink uppercase shadow-lift-1"
              >
                <IconArrowBackUp size={18} stroke={2.5} aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Layout</span>
              </button>
            )}
            <span className="hidden rounded-[var(--radius-pill)] border-2 border-ink bg-butter px-4 py-1.5 font-display text-label font-extrabold tracking-[0.12em] text-ink uppercase sm:inline-flex">
              Booth
            </span>
            <span className="hidden shrink-0 rounded-[var(--radius-pill)] border-2 border-ink bg-mint px-4 py-1.5 font-display text-label font-bold tracking-[0.12em] text-ink uppercase sm:inline-flex">
              {preset.shotCount} bidikan
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
              Ganti layout dan mengambil ulang foto sebanyak yang kamu mau sebelum
              menyimpan.
            </p>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
                      {layout.shotCount} bidikan
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="mt-10">
              <button
                type="button"
                onClick={startCamera}
                className="pressable inline-flex items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-mint px-8 py-4 font-display text-lead font-extrabold text-ink shadow-lift-2 hover:bg-sky"
              >
                <IconCamera size={24} stroke={2.5} aria-hidden="true" />
                Aktifkan kamera
              </button>
            </div>
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
                  onClick={backToLayout}
                  className="pressable inline-flex items-center rounded-[var(--radius)] border-2 border-ink bg-elev px-6 py-3 font-display text-body font-bold text-ink shadow-lift-1 hover:bg-butter"
                >
                  Ganti layout
                </button>
              </div>
            </div>
          </div>
        )}

        {(status === "ready" || status === "countdown" || status === "burst") && (
          <div className="shell flex flex-1 flex-col justify-center pb-[var(--page)]">
            <div className="mx-auto w-full max-w-3xl">
              <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
                <p className="font-display text-label font-bold tracking-[0.12em] text-ink-meta uppercase">
                  {preset.label} / {preset.shotCount} bidikan
                </p>
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
                disabled={shots.length === 0}
                className="pressable inline-flex items-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-pink px-7 py-4 font-display text-lead font-extrabold text-ink shadow-lift-2 hover:bg-[var(--mix-coral)] disabled:opacity-45"
              >
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

      <SiteFooter />
    </div>
  );
}
