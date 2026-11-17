"use client";

import {
  IconPlayerPlayFilled,
  IconPlayerStopFilled,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  liveFrameArtStyle,
  liveSlotFrame,
  waitForCanPlay,
} from "@/lib/live-frame";
import { isRect, type FilterKey, type Rect } from "@/lib/layouts";

type LiveClip = {
  slot: number;
  url: string;
  mime: string;
  durationMs: number;
  /** Printed photo window, when a bitmap frame moved the shot off the slot. */
  rect?: Rect;
  /** Frame artwork to repaint over the clip where it overlapped the photo. */
  frameSrc?: string;
};

type LivePhotoOverlayProps = {
  canvas: { w: number; h: number };
  slots: Rect[];
  clips: LiveClip[];
  /** The print's filter, so a playing clip doesn't turn colourful mid-print. */
  filterKey?: FilterKey;
};

/**
 * Turns the printed photos into playable clips.
 *
 * Tapping any photo slot starts all playable clips in the strip together,
 * returning each to its printed still when it ends (or stopping all of them
 * when tapped again). Each video is framed and cornered exactly like the
 * photo it covers - including the layout's fit rule, its outer corner radii and
 * the print's filter - so the transition reads as the photos coming alive
 * instead of video boxes appearing on top of them.
 *
 * A clip the browser cannot decode hides its control rather than offering a
 * button that does nothing.
 */
export function LivePhotoOverlay({
  canvas,
  slots,
  clips,
  filterKey = "original",
}: LivePhotoOverlayProps) {
  const [playingSlots, setPlayingSlots] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [sizes, setSizes] = useState<Record<number, { w: number; h: number }>>({});
  const [failed, setFailed] = useState<number[]>([]);
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});
  const loadAbortRef = useRef<AbortController | null>(null);

  const ordered = [...clips].sort((a, b) => a.slot - b.slot);

  const stopAll = useCallback(() => {
    loadAbortRef.current?.abort();
    loadAbortRef.current = null;
    setLoading(false);
    for (const video of Object.values(videoRefs.current)) {
      if (!video) continue;
      video.pause();
      video.currentTime = 0;
    }
    setPlayingSlots([]);
  }, []);

  const fail = useCallback((slot: number) => {
    setFailed((list) => (list.includes(slot) ? list : [...list, slot]));
    setPlayingSlots((current) => current.filter((s) => s !== slot));
  }, []);

  const toggle = useCallback(async () => {
    if (playingSlots.length > 0 || loading) {
      stopAll();
      return;
    }

    const playable = ordered.filter((clip) => {
      const slot = isRect(clip.rect) ? clip.rect : slots[clip.slot];
      return Boolean(slot && !failed.includes(clip.slot) && videoRefs.current[clip.slot]);
    });
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
      // Muted video is allowed to start from a tap; a rejected play (unsupported
      // codec, decoder busy) means this slot has no usable clip.
      void video.play().catch(() => fail(slot));
    }
  }, [fail, failed, loading, ordered, playingSlots.length, slots, stopAll]);

  // Leaving the page mid-clip should not keep a decoder running.
  useEffect(() => {
    const refs = videoRefs.current;
    return () => {
      loadAbortRef.current?.abort();
      for (const video of Object.values(refs)) video?.pause();
    };
  }, []);

  // A clip the browser cannot decode can fail before React hydrates - the
  // server-rendered markup starts loading the file while this island is still
  // booting, so the `onError` prop alone can miss it. Sweep what is mounted and
  // listen natively for later failures, so a dead control is never offered.
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    for (const [key, video] of Object.entries(videoRefs.current)) {
      if (!video) continue;
      const slot = Number(key);
      if (video.error) {
        fail(slot);
        continue;
      }
      const onError = () => fail(slot);
      video.addEventListener("error", onError);
      cleanups.push(() => video.removeEventListener("error", onError));
    }
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [fail, clips]);

  const isAnyPlaying = playingSlots.length > 0;

  return (
    <>
      {ordered.map((clip) => {
        // The clip's own window wins: with a bitmap frame the shot sits in the
        // frame's transparent window, not in the layout's slot.
        const slot = isRect(clip.rect) ? clip.rect : slots[clip.slot];
        if (!slot || failed.includes(clip.slot)) return null;

        const { box, video: videoStyle } = liveSlotFrame(slot, canvas, {
          size: sizes[clip.slot],
          filterKey,
        });

        const isSlotPlaying = playingSlots.includes(clip.slot);
        const label = "Live Photo";
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
              src={clip.url}
              muted
              playsInline
              preload="auto"
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
            <button
              type="button"
              onClick={toggle}
              aria-pressed={isAnyPlaying}
              aria-label={`${isAnyPlaying ? "Hentikan" : "Putar"} ${label}`}
              title={`${isAnyPlaying ? "Hentikan" : "Putar"} ${label}`}
              className="group absolute inset-0 z-10 cursor-pointer focus-visible:outline-none"
              style={{ borderRadius: videoStyle.borderRadius }}
            >
              <span
                aria-hidden="true"
                className={`absolute right-2.5 top-2.5 grid size-9 place-items-center rounded-full border-2 border-ink shadow-lift-1 transition-[background-color,transform] duration-150 group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-ink group-focus-visible:ring-offset-2 ${
                  isAnyPlaying
                    ? "bg-ink text-board-ink"
                    : "bg-elev text-ink group-hover:bg-butter"
                }`}
              >
                {isAnyPlaying ? (
                  <IconPlayerStopFilled size={12} aria-hidden="true" />
                ) : (
                  <IconPlayerPlayFilled
                    size={14}
                    aria-hidden="true"
                    className="translate-x-px"
                  />
                )}
              </span>
            </button>
          </div>
        );
      })}
    </>
  );
}
