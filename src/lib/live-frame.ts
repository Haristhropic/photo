import type { CSSProperties } from "react";

import {
  FILTERS,
  photoSlotRadii,
  type FilterKey,
  type Rect,
} from "./layouts";
import { photoFitsWholeFrame } from "./photo-transform";

/** The booth asks for 1280x960, so a clip is 4:3 until its metadata says
 *  otherwise. Using it as the pre-metadata default keeps the first frame from
 *  jumping between contain and cover. */
export const LIVE_CAMERA_W = 4;
export const LIVE_CAMERA_H = 3;

/**
 * Places one Live Photo clip exactly where its printed photo sits: the same
 * box, fit rule, outer corner radii and print filter. Shared by the result page
 * and the public gallery so a playing clip can never drift from the still it
 * covers.
 *
 * The clip is transparent outside its frame when the photo is shown whole, so
 * the blurred fill painted into the print stays visible around it.
 */
export function liveSlotFrame(
  slot: Rect,
  canvas: { w: number; h: number },
  options: {
    size?: { w: number; h: number };
    filterKey?: FilterKey;
  } = {},
): { box: CSSProperties; video: CSSProperties } {
  const { size, filterKey = "original" } = options;
  const wholeFrame = photoFitsWholeFrame(
    size?.w ?? LIVE_CAMERA_W,
    size?.h ?? LIVE_CAMERA_H,
    slot.w,
    slot.h,
  );

  const radii = photoSlotRadii(slot, canvas);
  // Border radii are percentages of the box; pairing each with the box's other
  // axis keeps the corner a circle, not an ellipse.
  const px = (radius: number, axis: number) => `${(radius / axis) * 100}%`;
  const borderRadius = `${px(radii.tl, slot.w)} ${px(radii.tr, slot.w)} ${px(
    radii.br,
    slot.w,
  )} ${px(radii.bl, slot.w)} / ${px(radii.tl, slot.h)} ${px(
    radii.tr,
    slot.h,
  )} ${px(radii.br, slot.h)} ${px(radii.bl, slot.h)}`;

  const filter = FILTERS[filterKey]?.css ?? "none";

  return {
    box: {
      left: `${(slot.x / canvas.w) * 100}%`,
      top: `${(slot.y / canvas.h) * 100}%`,
      width: `${(slot.w / canvas.w) * 100}%`,
      height: `${(slot.h / canvas.h) * 100}%`,
    },
    video: {
      objectFit: wholeFrame ? "contain" : "cover",
      borderRadius,
      filter: filter === "none" ? undefined : filter,
    },
  };
}

/**
 * Places a bitmap frame's artwork over a playing clip.
 *
 * The renderer paints the frame after the photos, so part of the artwork can
 * sit on top of a photo window. When a clip replaces the still, that part has
 * to be repainted over the video or it vanishes for the length of the clip.
 * The artwork is stretched to the whole canvas, so it is painted at canvas size
 * and shifted until the window's area fills the clip box; the box clips it.
 *
 * A background is used rather than an `<img>`: the picture is decoration, and
 * the remaining markup in this box is already inert to the pointer.
 */
export function liveFrameArtStyle(
  slot: Rect,
  canvas: { w: number; h: number },
  src: string,
): CSSProperties {
  return {
    position: "absolute",
    left: `${(-slot.x / slot.w) * 100}%`,
    top: `${(-slot.y / slot.h) * 100}%`,
    width: `${(canvas.w / slot.w) * 100}%`,
    height: `${(canvas.h / slot.h) * 100}%`,
    backgroundImage: `url("${src}")`,
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
  };
}

/**
 * Waits until a video element has enough buffered data to start playing in
 * sync with sibling clips, or resolves false if it errors or is aborted.
 */
export function waitForCanPlay(
  video: HTMLVideoElement,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted || video.error) return Promise.resolve(false);
  if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const cleanup = () => {
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    const onReady = () => {
      cleanup();
      resolve(true);
    };
    const onError = () => {
      cleanup();
      resolve(false);
    };
    const onAbort = () => {
      cleanup();
      resolve(false);
    };
    video.addEventListener("canplay", onReady);
    video.addEventListener("error", onError);
    signal.addEventListener("abort", onAbort, { once: true });
    if (video.networkState !== HTMLMediaElement.NETWORK_LOADING) {
      video.load();
    }
  });
}
