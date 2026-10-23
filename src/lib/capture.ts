export const COUNTDOWN_FROM = 3;
export const COUNTDOWN_STEP_MS = 1000;

/**
 * A null from grabFrame is usually transient (video not sized yet, or no 2d
 * context), so callers retry a few times before treating it as a real failure.
 */
export const FRAME_RETRY_ATTEMPTS = 3;
export const FRAME_RETRY_DELAY_MS = 120;

/**
 * Frames are rendered into slots no larger than ~900px, so storing the camera's
 * full native resolution only burns sessionStorage: a 4K front camera produces
 * multi-megabyte data URLs, and the booth keeps the same shots both as its run
 * snapshot and as the studio draft. Downscaling here keeps every layout
 * comfortable while leaving more pixels than the strip can show.
 */
export const MAX_CAPTURE_EDGE = 1440;
const CAPTURE_JPEG_QUALITY = 0.86;

/** A flat fill (black/white/transparent) means the video had no decoded frame. */
const MIN_FRAME_RANGE = 6;

export type CameraErrorKind =
  | "insecure"
  | "denied"
  | "missing"
  | "unavailable";

export class CameraError extends Error {
  readonly kind: CameraErrorKind;

  constructor(kind: CameraErrorKind, message: string) {
    super(message);
    this.name = "CameraError";
    this.kind = kind;
  }
}

export function cameraErrorMessage(kind: CameraErrorKind): string {
  switch (kind) {
    case "insecure":
      return "Kamera hanya bisa diakses lewat HTTPS atau di localhost.";
    case "denied":
      return "Izin kamera ditolak. Aktifkan izin kamera di pengaturan browser lalu coba lagi.";
    case "missing":
      return "Tidak ada kamera yang terdeteksi di perangkat ini.";
    case "unavailable":
      return "Kamera sedang dipakai aplikasi lain atau tidak tersedia.";
  }
}

export function describeCameraError(error: unknown): CameraError {
  if (error instanceof CameraError) return error;
  if (!(error instanceof DOMException)) {
    return new CameraError("unavailable", "Kamera tidak bisa dimulai.");
  }
  switch (error.name) {
    case "NotAllowedError":
    case "SecurityError":
      return new CameraError("denied", cameraErrorMessage("denied"));
    case "NotFoundError":
    case "OverconstrainedError":
      return new CameraError("missing", cameraErrorMessage("missing"));
    case "NotReadableError":
    case "AbortError":
      return new CameraError("unavailable", cameraErrorMessage("unavailable"));
    default:
      return new CameraError("unavailable", "Kamera tidak bisa dimulai.");
  }
}

export function captureAspect(width: number, height: number): number {
  return height === 0 ? 4 / 3 : width / height;
}

export function stopStream(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
}

/**
 * HTMLMediaElement.HAVE_CURRENT_DATA. videoWidth and videoHeight arrive with
 * metadata, which can be before any frame has been decoded, and drawing the
 * video in that window yields a blank canvas rather than the guest's photo.
 */
const HAVE_CURRENT_DATA = 2;

type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number) => void) => number;
};

function lumaRange(data: Uint8ClampedArray): number {
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    if (luma < min) min = luma;
    if (luma > max) max = luma;
  }
  return max - min;
}

/** Returns true for a flat fill, which means no frame has been decoded. */
function canvasIsBlank(canvas: HTMLCanvasElement): boolean {
  const probe = document.createElement("canvas");
  probe.width = 32;
  probe.height = 32;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(canvas, 0, 0, 32, 32);
  return lumaRange(ctx.getImageData(0, 0, 32, 32).data) < MIN_FRAME_RANGE;
}

function videoIsBlank(video: HTMLVideoElement): boolean {
  const probe = document.createElement("canvas");
  probe.width = 32;
  probe.height = 32;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(video, 0, 0, 32, 32);
  return lumaRange(ctx.getImageData(0, 0, 32, 32).data) < MIN_FRAME_RANGE;
}

/**
 * Resolves on the next frame the video actually presents. A fresh-stream wait
 * matters because replacing `srcObject` leaves the previous frame on screen
 * until the new one decodes, and `readyState` alone can still report that old
 * frame as ready. If the video is paused or the stream stalls there is no
 * callback, so the timeout reports failure instead of handing back a stale grab.
 */
export function waitForVideoFrame(
  video: HTMLVideoElement,
  timeoutMs = 1000,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    const frameVideo = video as FrameVideo;
    if (typeof frameVideo.requestVideoFrameCallback === "function") {
      frameVideo.requestVideoFrameCallback(() => finish(true));
    } else if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(() => finish(true)));
    } else {
      setTimeout(() => finish(true), 32);
    }
  });
}

/**
 * Waits until the element is playing a decoded, non-blank frame. The booth uses
 * this before the first countdown so a slow new stream cannot be photographed
 * as the previous run's frozen frame (or as a black canvas).
 */
export async function waitForVideoLive(
  video: HTMLVideoElement,
  timeoutMs = 4000,
): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  try {
    if (video.paused) await video.play();
  } catch {
    return false;
  }

  while (performance.now() < deadline) {
    if (
      !video.paused &&
      video.readyState >= HAVE_CURRENT_DATA &&
      video.videoWidth > 0
    ) {
      const remaining = deadline - performance.now();
      const fresh = await waitForVideoFrame(
        video,
        Math.min(900, Math.max(100, remaining)),
      );
      if (fresh && !videoIsBlank(video)) return true;
    }
    await sleep(60);
  }
  return false;
}

/**
 * Grabs one frame at the video's native resolution and mirrors it horizontally.
 *
 * The booth preview is mirrored with `scaleX(-1)` so the guest sees the
 * selfie-camera view they expect. Flipping the pixels here keeps the saved
 * photo identical to that preview instead of silently reversing it at download
 * time. `npm run e2e:mirror` guards this orientation.
 *
 * The frame is downscaled to MAX_CAPTURE_EDGE and a flat fill is rejected: a
 * frame that is still black or undecoded must count as a failed grab so the
 * caller retries instead of saving a blank slot.
 */
export function grabFrame(video: HTMLVideoElement): string | null {
  if (video.readyState < HAVE_CURRENT_DATA || video.paused) return null;

  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;

  const scale = Math.min(1, MAX_CAPTURE_EDGE / Math.max(width, height));
  const outWidth = Math.max(1, Math.round(width * scale));
  const outHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outWidth;
  canvas.height = outHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Mirror in place: shift to the right edge, then flip the x axis so the
  // draw lands back over the full frame, reversed.
  ctx.translate(outWidth, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, outWidth, outHeight);

  if (canvasIsBlank(canvas)) return null;

  return canvas.toDataURL("image/jpeg", CAPTURE_JPEG_QUALITY);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 16);
  });
}

export function sleepUntil(deadline: number): Promise<void> {
  const remaining = deadline - performance.now();
  return sleep(remaining > 0 ? remaining : 0);
}

export async function grabFrameWhenReady(
  video: HTMLVideoElement,
  attempts: number = FRAME_RETRY_ATTEMPTS,
): Promise<string | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    // Wait for a newly presented frame before grabbing. A live camera usually
    // delivers one within a frame or two; a stalled or not-yet-rendered stream
    // times out and the loop retries instead of saving the frozen old frame.
    const fresh = await waitForVideoFrame(video);
    if (fresh) {
      const frame = grabFrame(video);
      if (frame) return frame;
    }
    await sleep(FRAME_RETRY_DELAY_MS);
  }
  return null;
}

export function captureFailedMessage(shotCount: number): string {
  return `Kamera tidak berhasil menghasilkan ${shotCount} bidikan. Ambil ulang foto atau ganti layout.`;
}
