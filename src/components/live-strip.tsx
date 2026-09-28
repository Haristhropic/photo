"use client";

import { useEffect, useRef, useState } from "react";

import { COUNTDOWN_FROM, COUNTDOWN_STEP_MS, grabFrameWhenReady } from "@/lib/capture";

/**
 * Runs the real capture loop on the landing page, at the real cadence: a
 * countdown, then a genuine frame from the guest's own camera every 3 seconds.
 * It proves the mechanism instead of describing it, and it is the same loop
 * the booth uses, so the promise on the page cannot drift from the product.
 */
export function LiveStrip() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runRef = useRef(0);
  const shotsRef = useRef<string[]>([]);

  const [status, setStatus] = useState<"pending" | "countdown" | "done">("pending");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [shots, setShots] = useState<string[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return;

    let cancelled = false;

    const boot = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }

        const run = ++runRef.current;
        for (let shot = 0; shot < COUNTDOWN_FROM; shot += 1) {
          if (cancelled || runRef.current !== run) return;

          setStatus("countdown");
          const endAt = performance.now() + COUNTDOWN_FROM * COUNTDOWN_STEP_MS;
          for (let n = COUNTDOWN_FROM; n >= 1; n -= 1) {
            setCountdown(n);
            await new Promise((resolve) =>
              setTimeout(resolve, Math.max(0, endAt - (n - 1) * COUNTDOWN_STEP_MS - performance.now())),
            );
            if (cancelled || runRef.current !== run) return;
          }
          setCountdown(null);

          if (video) {
            const frame = await grabFrameWhenReady(video);
            if (frame) {
              shotsRef.current = [...shotsRef.current, frame].slice(-COUNTDOWN_FROM);
              setShots(shotsRef.current);
            }
          }
        }
        if (!cancelled && runRef.current === run) setStatus("done");
      } catch {
        if (!cancelled) setStatus("pending");
      }
    };

    void boot();

    return () => {
      cancelled = true;
      runRef.current += 1;
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    const fallback = setTimeout(() => {
      setTotal((n) => n + 1);
    }, 9000);
    return () => clearTimeout(fallback);
  }, [total]);

  const slots: (string | null)[] = shots.length > 0
    ? shots
    : Array.from({ length: COUNTDOWN_FROM }, () => null);

  return (
    <div className="relative">
      <div
        className="relative overflow-hidden rounded-[var(--radius-xl)] border-2 border-ink bg-board shadow-lift-3"
        style={{ transform: "rotate(-1.2deg)" }}
      >
        <div className="flex gap-2 bg-ink p-2" aria-hidden="true">
          {slots.map((shot, i) => (
            <div
              key={i}
              className="relative aspect-3/4 flex-1 overflow-hidden rounded-[10px] bg-board-ink/10"
            >
              {shot ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={shot}
                  alt={shots.length > 0 ? `Bidikan yang baru saja diambil` : ""}
                  className="size-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                />
              ) : (
                <div className="grid size-full place-items-center">
                  <span className="reg-cross size-6 text-board-ink/30" />
                </div>
              )}
            </div>
          ))}
        </div>

        {countdown !== null && (
          <div className="absolute inset-0 grid place-items-center bg-board/35">
            <span
              key={countdown}
              className="pop-count grid size-24 place-items-center rounded-full border-2 border-ink bg-butter font-display text-6xl font-extrabold text-ink shadow-lift-2"
            >
              {countdown}
            </span>
          </div>
        )}

        {status === "done" && (
          <div className="absolute inset-x-0 bottom-0 bg-mint px-3 py-2 text-center font-display text-label font-bold tracking-[0.14em] text-ink uppercase">
            3 detik per bidikan
          </div>
        )}
      </div>

      <p className="mt-6 text-center font-display text-small font-bold tracking-[0.1em] text-ink-meta uppercase">
        {status === "countdown"
          ? `Bidikan ${Math.min(total + 1, COUNTDOWN_FROM)} dari ${COUNTDOWN_FROM}`
          : "Ini booth sungguhan, jalan di HP kamu sekarang"}
      </p>
    </div>
  );
}
