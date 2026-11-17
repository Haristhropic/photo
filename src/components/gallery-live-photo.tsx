"use client";

import {
  IconPlayerPlayFilled,
  IconPlayerStopFilled,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

import {
  liveFrameArtStyle,
  liveSlotFrame,
  waitForCanPlay,
} from "@/lib/live-frame";
import { isRect, type FilterKey, type Rect } from "@/lib/layouts";

type GalleryLiveClip = { slot: number; rect?: Rect; frameSrc?: string };

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
 * control plays all of the strip's clips together, and each settles back to
 * its still when it ends (or all stop immediately when tapped again). Only
 * strips recorded with the camera's Live toggle on have clips, so a photo
 * uploaded from a phone never gets a fake moving version here.
 */
export function GalleryLivePhoto({
  id,
  canvas,
  slots,
  clips,
  filterKey = "original",
}: GalleryLivePhotoProps) {
  const [playingSlots, setPlayingSlots] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [sizes, setSizes] = useState<Record<number, { w: number; h: number }>>(
    {},
  );
  const [failed, setFailed] = useState<number[]>([]);
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});
  const loadAbortRef = useRef<AbortController | null>(null);

  const ordered = [...clips].sort((a, b) => a.slot - b.slot);
  // A clip this device cannot decode is skipped rather than stalling the strip.
  const playable = ordered.filter(
    (clip) => !failed.includes(clip.slot) && Boolean(isRect(clip.rect) ? clip.rect : slots[clip.slot]),
  );

  useEffect(() => {
    const refs = videoRefs.current;
    return () => {
      loadAbortRef.current?.abort();
      for (const video of Object.values(refs)) video?.pause();
    };
  }, []);

  function fail(slot: number) {
    setFailed((list) => (list.includes(slot) ? list : [...list, slot]));
    setPlayingSlots((current) => current.filter((s) => s !== slot));
  }

  function stop() {
    loadAbortRef.current?.abort();
    loadAbortRef.current = null;
    setLoading(false);
    for (const video of Object.values(videoRefs.current)) {
      if (!video) continue;
      video.pause();
      video.currentTime = 0;
    }
    setPlayingSlots([]);
  }

  async function toggle() {
    if (playingSlots.length > 0 || loading) {
      stop();
      return;
    }

    if (playable.length === 0) return;

    const controller = new AbortController();
    loadAbortRef.current = controller;
    setLoading(true);

    const results = await Promise.all(
      playable.map(async (clip) => {
        const video = videoRefs.current[clip.slot];
        if (!video) return { slot: clip.slot, ready: false };
        const ready = await waitForCanPlay(video, controller.signal);
        return { slot: clip.slot, ready };
      }),
    );

    if (controller.signal.aborted) return;
    loadAbortRef.current = null;
    setLoading(false);

    const readySlots: number[] = [];
    for (const { slot, ready } of results) {
      if (!ready) {
        fail(slot);
        continue;
      }
      const video = videoRefs.current[slot];
      if (!video) continue;
      video.currentTime = 0;
      readySlots.push(slot);
    }
    if (readySlots.length === 0) return;

    setPlayingSlots(readySlots);
    for (const slot of readySlots) {
      const video = videoRefs.current[slot];
      if (!video) continue;
      // Muted video may start from a tap. A rejected play means this device has
      // no decoder for the clip, so that slot is dropped while the rest play.
      void video.play().catch(() => fail(slot));
    }
  }

  if (playable.length === 0) return null;

  const isAnyPlaying = playingSlots.length > 0;

  return (
    <>
      {ordered.map((clip) => {
        // Prefer the window the studio recorded with the clip; a bitmap frame
        // moves the printed photos out of the layout's own slots.
        const slot = isRect(clip.rect) ? clip.rect : slots[clip.slot];
        if (!slot || failed.includes(clip.slot)) return null;

        const { box, video: videoStyle } = liveSlotFrame(slot, canvas, {
          size: sizes[clip.slot],
          filterKey,
        });
        const isSlotPlaying = playingSlots.includes(clip.slot);
        const artStyle = clip.frameSrc
          ? liveFrameArtStyle(slot, canvas, clip.frameSrc)
          : null;

        return (
          <div
            key={clip.slot}
            className="absolute overflow-hidden"
            style={{ ...box, borderRadius: videoStyle.borderRadius }}
          >
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
              onEnded={(event) => {
                event.currentTarget.currentTime = 0;
                setPlayingSlots((current) =>
                  current.filter((s) => s !== clip.slot),
                );
              }}
              onError={() => fail(clip.slot)}
              className={`pointer-events-none absolute inset-0 size-full transition-opacity duration-200 ${
                isSlotPlaying ? "opacity-100" : "opacity-0"
              }`}
              style={videoStyle}
            />
            {isSlotPlaying && clip.frameSrc && artStyle && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute"
                style={artStyle}
              />
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={toggle}
        aria-pressed={isAnyPlaying}
        aria-busy={loading}
        aria-label={
          isAnyPlaying
            ? "Hentikan Live Photo"
            : loading
              ? "Memuat Live Photo"
              : "Putar Live Photo"
        }
        title={
          isAnyPlaying
            ? "Hentikan Live Photo"
            : loading
              ? "Memuat Live Photo"
              : "Putar Live Photo"
        }
        className={`absolute right-2 top-2 z-10 inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-pill)] border-2 border-ink px-3 font-display text-label font-extrabold tracking-[0.1em] uppercase shadow-lift-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 ${
          isAnyPlaying
            ? "bg-ink text-board-ink"
            : "bg-elev text-ink hover:bg-butter"
        }`}
      >
        {isAnyPlaying ? (
          <IconPlayerStopFilled size={11} aria-hidden="true" />
        ) : (
          <IconPlayerPlayFilled
            size={11}
            aria-hidden="true"
            className="translate-x-px"
          />
        )}
        {loading ? "..." : "Live"}
      </button>
    </>
  );
}
