"use client";

import { useRef, useState } from "react";

type LivePhotoOverlayProps = {
  canvas: { w: number; h: number };
  slots: { x: number; y: number; w: number; h: number }[];
  clips: { slot: number; url: string; mime: string; durationMs: number }[];
};

export function LivePhotoOverlay({ canvas, slots, clips }: LivePhotoOverlayProps) {
  const [playing, setPlaying] = useState<number | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  function handlePlay(slot: number) {
    const video = videoRefs.current[slot];
    if (!video) return;
    video.currentTime = 0;
    video.load();
    const p = video.play();
    if (p) p.catch(() => {});
    setPlaying(slot);
  }

  function handleStop(slot: number) {
    const video = videoRefs.current[slot];
    if (!video) return;
    video.pause();
    video.currentTime = 0;
    setPlaying(null);
  }

  return (
    <>
      {clips.map((clip) => {
        const slot = slots[clip.slot];
        if (!slot) return null;

        const left = (slot.x / canvas.w) * 100;
        const top = (slot.y / canvas.h) * 100;
        const width = (slot.w / canvas.w) * 100;
        const height = (slot.h / canvas.h) * 100;
        const isPlaying = playing === clip.slot;

        return (
          <div
            key={clip.slot}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
            }}
          >
            <button
              type="button"
              onPointerDown={() => handlePlay(clip.slot)}
              onClick={() => handlePlay(clip.slot)}
              onPointerUp={() => handleStop(clip.slot)}
              onPointerLeave={() => handleStop(clip.slot)}
              aria-label={`Putar live photo slot ${clip.slot + 1}`}
              className="absolute right-2 top-2 z-10 rounded-[var(--radius-pill)] border-2 border-ink bg-coral px-2 py-0.5 font-display text-[10px] font-extrabold tracking-[0.08em] text-ink uppercase shadow-lift-1"
            >
              LIVE
            </button>
            <video
              ref={(el) => { videoRefs.current[clip.slot] = el; }}
              src={clip.url}
              muted
              playsInline
              preload="metadata"
              className={`absolute inset-0 size-full rounded-[6px] object-cover ${isPlaying ? "block" : "hidden"}`}
            />
          </div>
        );
      })}
    </>
  );
}
