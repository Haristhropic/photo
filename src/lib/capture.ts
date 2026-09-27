export const BURST_INTERVAL_MS = 700;
export const COUNTDOWN_FROM = 3;

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
 * Grabs one frame at the video's native resolution and mirrors it so the saved
 * photo matches the selfie preview the guest just saw.
 */
export function grabFrame(video: HTMLVideoElement): string | null {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", 0.9);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
