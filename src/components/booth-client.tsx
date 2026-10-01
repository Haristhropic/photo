"use client";

import {
  IconCamera,
  IconChevronLeft,
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
} from "@/lib/capture";
import { writeDraft } from "@/lib/draft-store";
import { LAYOUTS, LAYOUT_ORDER, type LayoutType } from "@/lib/layouts";

const BOOTH_KEY = "snapvibe.boothrun";

type BoothRun = { layoutType: LayoutType; shots: string[] };

/** Event slugs and access keys are `[a-z0-9-]`; anything else cannot be a real
 *  segment, so a crafted `from` cannot smuggle `//host` or `..` into the href. */
const SAFE_SEGMENT = /^[a-z0-9][a-z0-9-]*$/;

function resolveBackTarget(from: string | undefined): { href: string; label: string } {
  if (from) {
    const [kind, value] = from.split("/");
    if (kind === "e" && value && SAFE_SEGMENT.test(value)) {
      return { href: `/e/${value}`, label: "Kembali ke event" };
    }
    if (kind === "p" && value && SAFE_SEGMENT.test(value)) {
      return { href: `/p/${value}`, label: "Kembali ke foto" };
    }
    if (kind === "studio" && !value) {
      return { href: "/studio", label: "Kembali ke studio" };
    }
  }
  return { href: "/", label: "Kembali ke beranda" };
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
    return () => {
      runRef.current += 1;
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

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      // The permission prompt can still be open when the guest navigates away.
      // Without this guard the late resolution overwrites the screen they chose
      // and drops them back into the camera they just left.
      if (runRef.current !== run) {
        stopStream(stream);
        return;
      }
      streamRef.current = stream;
      setStream(stream);
      setStatus("ready");
    } catch (error) {
      if (runRef.current !== run) return;
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
    const isCurrent = () => runRef.current === run;

    setShots([]);
    setErrorText(null);
    setErrorKind(null);

    const taken: string[] = [];
    try {
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
      // here instead. Guarded so a cancelled run cannot stop a newer stream
      // that startCamera already installed.
      stopStream(stream);
      if (streamRef.current === stream) streamRef.current = null;
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
    writeDraft({ shots, layoutType, eventId: eventId ?? null });
    try {
      sessionStorage.removeItem(BOOTH_KEY);
    } catch {
      // The draft is already written, so a stale booth run is harmless.
    }
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
            <span className="rounded-[10px] bg-ink px-2.5 py-1 text-bg">
              Snap<span className="misregister">Vibe</span>
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href={back.href}
              aria-label={back.label}
              title={back.label}
              className="pressable inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-pill)] border-2 border-ink bg-elev px-3.5 py-1.5 font-display text-label font-bold tracking-[0.1em] text-ink uppercase shadow-lift-1"
            >
              <IconChevronLeft size={18} stroke={2.5} aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{back.label}</span>
            </Link>
            {status !== "intro" && (
              <button
                type="button"
                onClick={backToLayout}
                aria-label="Ganti layout"
                className="pressable inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-pill)] border-2 border-ink bg-elev px-3.5 py-1.5 font-display text-label font-bold tracking-[0.1em] text-ink uppercase shadow-lift-1"
              >
                <IconRefresh size={18} stroke={2.5} aria-hidden="true" />
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
          className={`shell flex flex-1 flex-col justify-center py-10 ${
            showPreview ? "" : "hidden"
          }`}
        >
          <div className="mx-auto w-full max-w-3xl">
            <div
              className="relative w-full overflow-hidden rounded-[var(--radius-xl)] border-2 border-ink bg-board shadow-lift-3"
              style={{ aspectRatio: `${aspect}`, transform: "rotate(-0.8deg)" }}
            >
              <video
                ref={videoRef}
                playsInline
                muted
                className="size-full scale-x-[-1] object-cover"
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
          <div className="shell flex flex-1 flex-col justify-center py-[var(--section)]">
            <h1 className="text-display font-extrabold">Pilih layout</h1>
            <p className="mt-4 max-w-[var(--measure)] text-lead text-ink-body">
              Ganti layout dan mengambil ulang foto sebanyak yang kamu mau sebelum
              menyimpan.
            </p>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {LAYOUT_ORDER.map((key) => {
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
                    <div className="grid h-36 place-items-center rounded-[10px] border-2 border-ink bg-sunken p-3">
                      <div
                        className="flex max-h-full gap-1"
                        style={{
                          aspectRatio: `${layout.canvas.w} / ${layout.canvas.h}`,
                          height: "100%",
                        }}
                      >
                        {layout.slots.map((slot, i) => (
                          <div
                            key={i}
                            className={`flex-1 rounded-[2px] ${
                              active ? "bg-pink ring-1 ring-ink/25" : "bg-elev ring-1 ring-ink/20"
                            }`}
                          />
                        ))}
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
          <div className="shell flex flex-1 flex-col justify-center py-[var(--section)]">
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
          <div className="shell flex flex-1 flex-col justify-center pb-10">
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
          <div data-testid="review" className="shell flex flex-1 flex-col justify-center py-10">
            <h1 className="font-display text-h2 font-extrabold">Ini fotomu</h1>
            <p className="mt-3 max-w-[var(--measure)] text-lead text-ink-body">
              Puas? Lanjut ke studio untuk ganti filter, tambah stiker, lalu
              simpan.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
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
                <IconRefresh size={22} stroke={2.5} aria-hidden="true" />
                Ambil ulang
              </button>
            </div>
          </div>
        )}

        {status === "requesting" && (
          <div className="shell flex flex-1 flex-col justify-center py-[var(--section)]">
            <p className="font-display text-lead font-bold text-ink-body">
              Menunggu izin kamera...
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
