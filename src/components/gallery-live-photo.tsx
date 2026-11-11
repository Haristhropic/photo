"use client";

import {
  IconPlayerPlayFilled,
  IconPlayerStopFilled,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

import { liveSlotFrame } from "@/lib/live-frame";
import type { FilterKey, Rect } from "@/lib/layouts";

type GalleryLiveClip = { slot: number };

type GalleryLivePhotoProps = {
  /** Session id. Clips are fetched through this, never by their stored URL. */
  id: string;
  canvas: { w: number; h: number };
  slots: Rect[];
  clips: GalleryLiveClip[];
  filterKey?: FilterKey;
};

/**
 * The public-gallery counterpart of the result page's Live Photo overlay.
 *
 * A gallery card is too small to carry one play button per photo, so a single
 * control plays the strip's clips in shot order: the first slot comes alive,
 * then the next, and the strip settles back to its still when the last one
 * ends. Only strips recorded with the camera's Live toggle on have clips, so a
 * photo uploaded from a phone never gets a fake moving version here.
 */
export function GalleryLivePhoto({
  id,
  canvas,
  slots,
  clips,
  filterKey = "original",
}: GalleryLivePhotoProps) {
  const [playing, setPlaying] = useState<number | null>(null);
  const [sizes, setSizes] = useState<Record<number, { w: number; h: number }>>(
    {},
  );
  const [failed, setFailed] = useState<number[]>([]);
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});

  const ordered = [...clips].sort((a, b) => a.slot - b.slot);
  // A clip this device cannot decode is skipped rather than stalling the strip.
  const sequence = ordered.filter((clip) => !failed.includes(clip.slot));

  useEffect(() => {
    const refs = videoRefs.current;
    return () => {
      for (const video of Object.values(refs)) video?.pause();
    };
  }, []);

  function stop() {
    for (const video of Object.values(videoRefs.current)) {
      if (!video) continue;
      video.pause();
      video.currentTime = 0;
    }
    setPlaying(null);
  }

  function step(from: number) {
    const index = sequence.findIndex((clip) => clip.slot === from);
    const next = sequence[index + 1];
    if (!next) {
      setPlaying(null);
      return;
    }
    play(next.slot);
  }

  function play(slot: number) {
    const video = videoRefs.current[slot];
    if (!video) {
      step(slot);
      return;
    }
    video.currentTime = 0;
    setPlaying(slot);
    // Muted video may start from a tap. A rejected play means this device has
    // no decoder for the clip, so the slot is dropped and the rest continue.
    void video.play().catch(() => {
      setFailed((list) => (list.includes(slot) ? list : [...list, slot]));
      step(slot);
    });
  }

  function toggle() {
    if (playing !== null) {
      stop();
      return;
    }
    const first = sequence[0];
    if (first) play(first.slot);
  }

  if (sequence.length === 0) return null;

  return (
    <>
      {ordered.map((clip) => {
        const slot = slots[clip.slot];
        if (!slot || failed.includes(clip.slot)) return null;

        const { box, video: videoStyle } = liveSlotFrame(slot, canvas, {
          size: sizes[clip.slot],
          filterKey,
        });
        const isPlaying = playing === clip.slot;

        return (
          <div key={clip.slot} className="absolute" style={box}>
            <video
              ref={(el) => {
                videoRefs.current[clip.slot] = el;
              }}
              src={`/api/gallery/live/${id}/${clip.slot}`}
              muted
              playsInline
              // Nothing is downloaded until the guest asks to see the motion.
              preload="none"
              disablePictureInPicture
              aria-hidden="true"
              tabIndex={-1}
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                if (video.videoWidth <= 0 || video.videoHeight <= 0) return;
                setSizes((current) => ({
                  ...current,
                  [clip.slot]: { w: video.videoWidth, h: video.videoHeight },
                }));
              }}
              onEnded={() => step(clip.slot)}
              onError={() => {
                setFailed((list) =>
                  list.includes(clip.slot) ? list : [...list, clip.slot],
                );
                step(clip.slot);
              }}
              className={`pointer-events-none absolute inset-0 size-full transition-opacity duration-200 ${
                isPlaying ? "opacity-100" : "opacity-0"
              }`}
              style={videoStyle}
            />
          </div>
        );
      })}

      <button
        type="button"
        onClick={toggle}
        aria-pressed={playing !== null}
        aria-label={
          playing !== null ? "Hentikan Live Photo" : "Putar Live Photo"
        }
        title={playing !== null ? "Hentikan Live Photo" : "Putar Live Photo"}
        className={`absolute right-2 top-2 z-10 inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-pill)] border-2 border-ink px-3 font-display text-label font-extrabold tracking-[0.1em] uppercase shadow-lift-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 ${
          playing !== null
            ? "bg-ink text-board-ink"
            : "bg-elev text-ink hover:bg-butter"
        }`}
      >
        {playing !== null ? (
          <IconPlayerStopFilled size={11} aria-hidden="true" />
        ) : (
          <IconPlayerPlayFilled
            size={11}
            aria-hidden="true"
            className="translate-x-px"
          />
        )}
        Live
      </button>
    </>
  );
}
