"use client";

import { useEffect, useRef, useState } from "react";

import { COUNTDOWN_FROM, COUNTDOWN_STEP_MS, sleep } from "@/lib/capture";

/** How long a shot rests in the strip before the next countdown starts. */
const FRAME_SETTLE_MS = 500;
/** How long the finished strip holds before the demo loops. */
const HOLD_MS = 3200;

/**
 * The landing-page strip is a demo, and it is careful to stay one: it runs the
 * real cadence — a 3-second countdown, then a shot landing in the strip, three
 * times — using drawn placeholders, and it never touches the guest's camera.
 * The marketing page has no business asking for the camera before the guest has
 * chosen to walk into the booth; `/booth` is where the capture loop lives.
 */
export function LiveStrip() {
  const runRef = useRef(0);
  const [shots, setShots] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(COUNTDOWN_FROM);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = ++runRef.current;

    const loop = async () => {
      // Motion-reduced guests get the finished strip as a still: no timers, and
      // no camera either.
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        setCountdown(null);
        setShots(COUNTDOWN_FROM);
        setReady(true);
        return;
      }

      while (!cancelled && runRef.current === run) {
        setShots(0);
        setReady(false);

        for (let shot = 0; shot < COUNTDOWN_FROM; shot += 1) {
          for (let n = COUNTDOWN_FROM; n >= 1; n -= 1) {
            if (cancelled || runRef.current !== run) return;
            setCountdown(n);
            await sleep(COUNTDOWN_STEP_MS);
          }
          if (cancelled || runRef.current !== run) return;

          setCountdown(null);
          setShots(shot + 1);
          await sleep(FRAME_SETTLE_MS);
        }

        if (cancelled || runRef.current !== run) return;
        setReady(true);
        await sleep(HOLD_MS);
      }
    };

    void loop();

    return () => {
      cancelled = true;
      runRef.current += 1;
    };
  }, []);

  return (
    <div className="relative">
      <div
        className="relative overflow-hidden rounded-[var(--radius-xl)] border-2 border-ink bg-board shadow-lift-3"
        style={{ transform: "rotate(-1.2deg)" }}
      >
        <div className="flex gap-2 bg-ink p-2" aria-hidden="true">
          {Array.from({ length: COUNTDOWN_FROM }, (_, i) => {
            const filled = i < shots;
            return (
              <div
                key={i}
                data-slot-state={filled ? "filled" : "empty"}
                className="relative aspect-3/4 flex-1 overflow-hidden rounded-[10px] bg-board-ink/10"
              >
                {filled ? (
                  <StripPlaceholder index={i} />
                ) : (
                  <div className="grid size-full place-items-center">
                    <span className="reg-cross size-6 text-board-ink/30" />
                  </div>
                )}
              </div>
            );
          })}
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

        {ready && (
          <div className="absolute inset-x-0 bottom-0 bg-mint px-3 py-2 text-center font-display text-label font-bold tracking-[0.14em] text-ink uppercase">
            3 detik per bidikan
          </div>
        )}
      </div>

      <p className="mt-6 text-center font-display text-small font-bold tracking-[0.1em] text-ink-meta uppercase">
        {countdown !== null
          ? `Bidikan ${shots + 1} dari ${COUNTDOWN_FROM}`
          : "Begini ritmenya saat kamu mulai jepret"}
      </p>
    </div>
  );
}

/**
 * A drawn stand-in for one shot. It is deliberately a placeholder and not a
 * photograph: the strip has to show that a frame landed without pretending to
 * hold a real guest's picture, and it uses the same portrait language as the
 * layout picker so the two read as one idea.
 */
function StripPlaceholder({ index }: { index: number }) {
  return (
    // Sizing is inline because an unlayered `svg { height: auto }` in
    // globals.css outranks Tailwind's layered `size-full`.
    <svg
      viewBox="0 0 300 400"
      style={{ display: "block", width: "100%", height: "100%" }}
      aria-hidden="true"
    >
      <rect width="300" height="400" fill="var(--bg)" />
      <g
        fill="var(--ink)"
        opacity="0.78"
        transform={`translate(150 214) scale(1.55) rotate(${(index - 1) * 4})`}
      >
        <circle cy="-20" r="20" />
        <path d="M -42 46a42 34 0 0 1 84 0z" />
      </g>
    </svg>
  );
}
