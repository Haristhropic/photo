const CLOUDINARY_UPLOAD_MARKER = "/image/upload/";

/**
 * Adds delivery transformations to a Cloudinary URL without touching the
 * stored asset. Local fallback URLs are returned unchanged so callers can use
 * one helper for both storage backends.
 */
export function cloudinaryImageUrl(url: string, transformation: string): string {
  if (!url.includes("res.cloudinary.com")) return url;

  const markerIndex = url.indexOf(CLOUDINARY_UPLOAD_MARKER);
  if (markerIndex === -1) return url;

  const insertionPoint = markerIndex + CLOUDINARY_UPLOAD_MARKER.length;
  return `${url.slice(0, insertionPoint)}${transformation}/${url.slice(insertionPoint)}`;
}

/** Gallery cards are small, so ask Cloudinary for a bounded, modern format. */
export function galleryThumbnailUrl(url: string, width = 480): string {
  return cloudinaryImageUrl(url, `c_limit,f_auto,q_auto,w_${width}`);
}

/** Admin thumbnails only need to be legible, not print resolution. */
export function adminThumbnailUrl(url: string, width = 360): string {
  return cloudinaryImageUrl(url, `c_limit,f_auto,q_auto,w_${width}`);
}
