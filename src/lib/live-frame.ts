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
