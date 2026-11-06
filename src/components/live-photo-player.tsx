"use client";

import {
  IconPlayerPlayFilled,
  IconPlayerStopFilled,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import {
  FILTERS,
  photoSlotRadii,
  type FilterKey,
  type Rect,
} from "@/lib/layouts";
import { photoFitsWholeFrame } from "@/lib/photo-transform";

type LiveClip = { slot: number; url: string; mime: string; durationMs: number };

type LivePhotoOverlayProps = {
  canvas: { w: number; h: number };
  slots: Rect[];
  clips: LiveClip[];
  /** The print's filter, so a playing clip doesn't turn colourful mid-print. */
  filterKey?: FilterKey;
};

/** The booth asks for 1280x960, so a clip is 4:3 until its metadata says
 *  otherwise. Using it as the pre-metadata default keeps the first frame from
 *  jumping between contain and cover. */
const CAMERA_W = 4;
const CAMERA_H = 3;

/**
 * Turns the printed photos into playable clips.
 *
 * Each photo slot becomes one control: the whole slot is the tap target, and a
 * small play button in its corner is the visible affordance. A clip plays on
 * tap, returns to the printed still when it ends (or when tapped again), and
 * only one plays at a time. The video is framed and cornered exactly like the
 * photo it covers - including the layout's fit rule, its outer corner radii and
 * the print's filter - so the transition reads as the photo coming alive
 * instead of a video box appearing on top of it.
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
  const [playing, setPlaying] = useState<number | null>(null);
  const [sizes, setSizes] = useState<Record<number, { w: number; h: number }>>({});
  const [failed, setFailed] = useState<number[]>([]);
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});

  const reset = useCallback((slot: number) => {
    const video = videoRefs.current[slot];
    if (!video) return;
    video.pause();
    video.currentTime = 0;
  }, []);

  const fail = useCallback((slot: number) => {
    setFailed((list) => (list.includes(slot) ? list : [...list, slot]));
    setPlaying((current) => (current === slot ? null : current));
  }, []);

  const toggle = useCallback(
    (slot: number) => {
      const video = videoRefs.current[slot];
      if (!video) return;

      if (playing === slot) {
        reset(slot);
        setPlaying(null);
        return;
      }

      if (playing !== null) reset(playing);
      video.currentTime = 0;
      setPlaying(slot);
      // Muted video is allowed to start from a tap; a rejected play (unsupported
      // codec, decoder busy) means this slot has no usable clip.
      void video.play().catch(() => fail(slot));
    },
    [fail, playing, reset],
  );

  // Leaving the page mid-clip should not keep a decoder running.
  useEffect(() => {
    const refs = videoRefs.current;
    return () => {
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

  const ordered = [...clips].sort((a, b) => a.slot - b.slot);
  const filter = FILTERS[filterKey]?.css ?? "none";

  return (
    <>
      {ordered.map((clip) => {
        const slot = slots[clip.slot];
        if (!slot || failed.includes(clip.slot)) return null;

        const size = sizes[clip.slot];
        const wholeFrame = photoFitsWholeFrame(
          size?.w ?? CAMERA_W,
          size?.h ?? CAMERA_H,
          slot.w,
          slot.h,
        );

        const radii = photoSlotRadii(slot, canvas);
        // Border radii are percentages of the box; pairing each with the box's
        // other axis keeps the corner a circle, not an ellipse.
        const px = (radius: number, axis: number) =>
          `${(radius / axis) * 100}%`;
        const borderRadius = `${px(radii.tl, slot.w)} ${px(radii.tr, slot.w)} ${px(
          radii.br,
          slot.w,
        )} ${px(radii.bl, slot.w)} / ${px(radii.tl, slot.h)} ${px(
          radii.tr,
          slot.h,
        )} ${px(radii.br, slot.h)} ${px(radii.bl, slot.h)}`;

        const isPlaying = playing === clip.slot;
        const label = `Live Photo foto ${clip.slot + 1}`;

        const videoStyle: CSSProperties = {
          objectFit: wholeFrame ? "contain" : "cover",
          borderRadius,
          filter: filter === "none" ? undefined : filter,
        };

        return (
          <div
            key={clip.slot}
            className="absolute"
            style={{
              left: `${(slot.x / canvas.w) * 100}%`,
              top: `${(slot.y / canvas.h) * 100}%`,
              width: `${(slot.w / canvas.w) * 100}%`,
              height: `${(slot.h / canvas.h) * 100}%`,
            }}
          >
            <video
              ref={(el) => {
                videoRefs.current[clip.slot] = el;
              }}
              src={clip.url}
              muted
              playsInline
              preload="metadata"
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
                setPlaying((current) =>
                  current === clip.slot ? null : current,
                );
              }}
              onError={() => fail(clip.slot)}
              className={`pointer-events-none absolute inset-0 size-full transition-opacity duration-200 ${
                isPlaying ? "opacity-100" : "opacity-0"
              }`}
              style={videoStyle}
            />
            <button
              type="button"
              onClick={() => toggle(clip.slot)}
              aria-pressed={isPlaying}
              aria-label={`${isPlaying ? "Hentikan" : "Putar"} ${label}`}
              title={`${isPlaying ? "Hentikan" : "Putar"} ${label}`}
              className="group absolute inset-0 z-10 cursor-pointer focus-visible:outline-none"
              style={{ borderRadius }}
            >
              <span
                aria-hidden="true"
                className={`absolute right-2.5 top-2.5 grid size-9 place-items-center rounded-full border-2 border-ink shadow-lift-1 transition-[background-color,transform] duration-150 group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-ink group-focus-visible:ring-offset-2 ${
                  isPlaying
                    ? "bg-ink text-board-ink"
                    : "bg-elev text-ink group-hover:bg-butter"
                }`}
              >
                {isPlaying ? (
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
