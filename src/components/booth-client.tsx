"use client";

import {
  IconCamera,
  IconChevronLeft,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  BURST_INTERVAL_MS,
  COUNTDOWN_FROM,
  cameraErrorMessage,
  captureAspect,
  describeCameraError,
  grabFrame,
  sleep,
  stopStream,
} from "@/lib/capture";
import { LAYOUTS, LAYOUT_ORDER, type LayoutType } from "@/lib/layouts";

const DRAFT_KEY = "snapvibe.draft";

type Status = "intro" | "requesting" | "ready" | "countdown" | "burst" | "review" | "error";

export function BoothClient({ eventId }: { eventId?: string }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<Status>("intro");
  const [layoutType, setLayoutType] = useState<LayoutType>("STRIP_3");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [shots, setShots] = useState<string[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [aspect, setAspect] = useState(4 / 3);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const preset = LAYOUTS[layoutType];
  const showPreview =
    status === "ready" || status === "countdown" || status === "burst";

  useEffect(() => {
    return () => stopStream(streamRef.current);
  }, []);

  // The video element stays mounted across states, so the stream is attached
  // here once both the ref and the stream exist.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    video.srcObject = stream;
    void video
      .play()
      .then(() => setAspect(captureAspect(video.videoWidth, video.videoHeight)))
      .catch(() => undefined);
  }, [stream, status]);

  const startCamera = useCallback(async () => {
    setStatus("requesting");
    setErrorText(null);

    if (!window.isSecureContext) {
      setErrorText(cameraErrorMessage("insecure"));
      setStatus("error");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorText(cameraErrorMessage("unavailable"));
      setStatus("error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      setStream(stream);
      setStatus("ready");
    } catch (error) {
      setErrorText(describeCameraError(error).message);
      setStatus("error");
    }
  }, []);

  const runBurst = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    setStatus("burst");
    const taken: string[] = [];
    for (let i = 0; i < preset.shotCount; i += 1) {
      const frame = grabFrame(video);
      if (frame) taken.push(frame);
      if (i < preset.shotCount - 1) await sleep(BURST_INTERVAL_MS);
    }

    setShots(taken);
    stopStream(streamRef.current);
    streamRef.current = null;
    setStatus("review");
  }, [preset.shotCount]);

  const runCountdown = useCallback(async () => {
    setStatus("countdown");
    for (let n = COUNTDOWN_FROM; n >= 1; n -= 1) {
      setCountdown(n);
      await sleep(1000);
    }
    setCountdown(null);
    await runBurst();
  }, [runBurst]);

  function retake() {
    setShots([]);
    setCountdown(null);
    startCamera();
  }

  function backToLayout() {
    setShots([]);
    setStatus("intro");
    setErrorText(null);
  }

  function proceed() {
    if (shots.length === 0) return;
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ shots, layoutType, eventId: eventId ?? null }),
    );
    router.push("/studio");
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line">
        <div className="shell flex h-16 items-center justify-between">
          <button
            type="button"
            onClick={backToLayout}
            className="inline-flex items-center gap-2 font-mono text-label tracking-[0.16em] uppercase text-meta transition-colors hover:text-accent"
          >
            <IconChevronLeft size={18} stroke={1.75} aria-hidden="true" />
          </button>
          <span className="font-mono text-label font-semibold tracking-[0.16em] uppercase">
            Booth
          </span>
          <span className="font-mono text-label tracking-[0.16em] uppercase text-meta">
            {preset.shotCount} bidikan
          </span>
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
              className="relative w-full overflow-hidden border border-line bg-board"
              style={{ aspectRatio: `${aspect}` }}
            >
              <video
                ref={videoRef}
                playsInline
                muted
                className="size-full scale-x-[-1] object-cover"
              />
              {countdown !== null && (
                <div className="absolute inset-0 grid place-items-center bg-scrim">
                  <span className="font-mono text-display font-semibold text-board-ink">
                    {countdown}
                  </span>
                </div>
              )}
              {status === "burst" && (
                <div className="absolute inset-x-0 bottom-0 bg-scrim p-3 text-center font-mono text-label tracking-[0.16em] uppercase text-board-ink">
                  Mengambil bidikan
                </div>
              )}
            </div>
          </div>
        </div>
        {status === "intro" && (
          <div className="shell flex flex-1 flex-col justify-center py-[var(--section)]">
            <h1 className="text-display font-semibold">Pilih layout</h1>
            <p className="mt-4 max-w-[var(--measure)] text-lead text-ink-body">
              Kamu bisa ganti layout dan mengambil ulang foto sebelum menyimpan.
            </p>

            <div className="mt-10 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
              {LAYOUT_ORDER.map((key) => {
                const layout = LAYOUTS[key];
                const active = key === layoutType;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setLayoutType(key)}
                    aria-pressed={active}
                    className={`p-6 text-left transition-colors ${
                      active ? "bg-wash" : "bg-elev hover:bg-sunken"
                    }`}
                  >
                    <div
                      className="flex gap-1 border border-line bg-sunken p-2"
                      style={{ aspectRatio: `${layout.canvas.w} / ${layout.canvas.h}` }}
                    >
                      {layout.slots.map((slot, i) => (
                        <div
                          key={i}
                          className={`flex-1 border ${
                            active ? "border-accent bg-elev" : "border-line-strong bg-elev"
                          }`}
                        />
                      ))}
                    </div>
                    <p
                      className={`mt-5 text-h3 font-semibold ${
                        active ? "text-accent" : ""
                      }`}
                    >
                      {layout.label}
                    </p>
                    <p className="mt-1 font-mono text-label tracking-[0.16em] uppercase text-meta">
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
                className="inline-flex items-center justify-center gap-2 border border-accent bg-accent px-6 py-3 text-body font-medium text-on-accent transition-colors duration-150 hover:bg-accent-hover"
              >
                <IconCamera size={20} stroke={1.75} aria-hidden="true" />
                Aktifkan kamera
              </button>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="shell flex flex-1 flex-col justify-center py-[var(--section)]">
            <div className="max-w-[var(--measure)] border border-line bg-elev p-8">
              <span className="grid size-12 place-items-center border border-line text-accent">
                <IconX size={24} stroke={1.75} aria-hidden="true" />
              </span>
              <h1 className="mt-6 text-h2 font-semibold">Kamera belum aktif</h1>
              <p className="mt-3 text-lead text-ink-body">{errorText}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={startCamera}
                  className="inline-flex items-center gap-2 border border-accent bg-accent px-6 py-3 text-body font-medium text-on-accent transition-colors duration-150 hover:bg-accent-hover"
                >
                  <IconRefresh size={20} stroke={1.75} aria-hidden="true" />
                  Coba lagi
                </button>
                <button
                  type="button"
                  onClick={backToLayout}
                  className="inline-flex items-center border border-line-strong px-6 py-3 text-body font-medium text-ink transition-colors duration-150 hover:border-ink"
                >
                  Ganti layout
                </button>
              </div>
            </div>
          </div>
        )}

        {(status === "ready" || status === "countdown" || status === "burst") && (
          <div className="shell flex flex-1 flex-col justify-center py-10">
            <div className="mx-auto w-full max-w-3xl">
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                <p className="font-mono text-label tracking-[0.16em] uppercase text-meta">
                  {preset.label} / {preset.shotCount} bidikan
                </p>
                <button
                  type="button"
                  onClick={runCountdown}
                  disabled={status !== "ready"}
                  className="inline-flex items-center gap-2 border border-accent bg-accent px-8 py-4 text-lead font-medium text-on-accent transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <IconCamera size={22} stroke={1.75} aria-hidden="true" />
                  Jepret
                </button>
              </div>
            </div>
          </div>
        )}

        {status === "review" && (
          <div className="shell flex flex-1 flex-col justify-center py-10">
            <h1 className="text-h2 font-semibold">Cek hasilnya</h1>
            <p className="mt-3 text-lead text-ink-body">
              Puas? Lanjut ke studio untuk ganti filter, tambah frame, lalu simpan.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {shots.map((shot, i) => (
                <img
                  key={i}
                  src={shot}
                  alt={`Bidikan ${i + 1}`}
                  className="aspect-3/4 w-full border border-line object-cover"
                />
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={proceed}
                disabled={shots.length === 0}
                className="inline-flex items-center gap-2 border border-accent bg-accent px-6 py-3 text-body font-medium text-on-accent transition-colors duration-150 hover:bg-accent-hover disabled:opacity-50"
              >
                Lanjut ke studio
              </button>
              <button
                type="button"
                onClick={retake}
                className="inline-flex items-center gap-2 border border-line-strong px-6 py-3 text-body font-medium text-ink transition-colors duration-150 hover:border-ink"
              >
                <IconRefresh size={20} stroke={1.75} aria-hidden="true" />
                Ambil ulang
              </button>
            </div>
          </div>
        )}

        {status === "requesting" && (
          <div className="shell flex flex-1 flex-col justify-center py-[var(--section)]">
            <p className="text-lead text-ink-body">Menunggu izin kamera...</p>
          </div>
        )}
      </main>
    </div>
  );
}
