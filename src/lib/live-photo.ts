/**
 * Live Photo — per-shot silent video clips.
 *
 * Uses `MediaRecorder` + `HTMLCanvasElement.captureStream()`.  A mirrored
 * canvas is drawn at 480 px long edge, 24 fps, ~800 kbps.  Each call to
 * `startForShot()` returns a handle that must be stopped once the shutter
 * fires (or cancelled if the run aborts).
 *
 * Returns a `{ blob, mime, durationMs }` object on success, or `null` when
 * the browser cannot record or the stream stalls.
 */

export type LiveClip = {
  blob: Blob;
  mime: string;
  durationMs: number;
};

type RecorderHandle = {
  stop(): Promise<LiveClip | null>;
  cancel(): void;
};

// Preferred MIME types in priority order.
const PREFERRED_MIMES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
] as const;

function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const mime of PREFERRED_MIMES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  // Fallback to whatever the browser claims it can record.
  if (MediaRecorder.isTypeSupported("video/webm")) return "video/webm";
  return null;
}

const MAX_CLIP_MS = 4000; // Hard stop so a runaway recorder never leaks memory.
const CANVAS_LONG_EDGE = 480;
const FPS = 24;
const BIT_RATE = 800_000;

let warned = false;

export function isLivePhotoSupported(): boolean {
  return pickMime() !== null;
}

export function startForShot(stream: MediaStream): RecorderHandle {
  const mime = pickMime();
  if (!mime) return { stop: async () => null, cancel: () => {} };

  const canvas = document.createElement("canvas");
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;

  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let startTs = 0;
  let animId = 0;
  let stopped = false;

  function drawFrame() {
    if (stopped) return;
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      const scale = Math.min(1, CANVAS_LONG_EDGE / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Mirror: same transform as grabFrame.
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
    }
    animId = requestAnimationFrame(drawFrame);
  }

  // Wait for the first decoded frame before starting the recorder.
  function waitForFirstFrame(): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 1500);
      function check() {
        if (video.videoWidth > 0) {
          clearTimeout(timeout);
          resolve(true);
          return;
        }
        requestAnimationFrame(check);
      }
      check();
    });
  }

  const ready = (async () => {
    try { await video.play(); } catch { return; }
    const live = await waitForFirstFrame();
    if (!live) return;
    if (stopped) return;
    startTs = performance.now();
    const streamForCanvas = canvas.captureStream(FPS);
    recorder = new MediaRecorder(streamForCanvas, { mimeType: mime, videoBitsPerSecond: BIT_RATE });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.start(100);
    drawFrame();
    // Auto-stop safety cap.
    setTimeout(() => { if (!stopped) void stop(); }, MAX_CLIP_MS);
  })();

  function stop(): Promise<LiveClip | null> {
    if (stopped) return Promise.resolve(null);
    stopped = true;
    cancelAnimationFrame(animId);
    return ready.then(() => {
      if (!recorder || recorder.state === "inactive") {
        if (chunks.length === 0) return null;
        const dur = Math.round(performance.now() - startTs);
        const mimeStr = mime || "video/webm";
        return { blob: new Blob(chunks, { type: mimeStr }), mime: mimeStr, durationMs: dur };
      }
      return new Promise<LiveClip | null>((resolve) => {
        recorder!.onstop = () => {
          if (chunks.length === 0) { resolve(null); return; }
          const dur = Math.round(performance.now() - startTs);
          const mimeStr = mime || "video/webm";
          resolve({ blob: new Blob(chunks, { type: mimeStr }), mime: mimeStr, durationMs: dur });
        };
        recorder!.stop();
      });
    });
  }

  function cancel() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(animId);
    try { if (recorder && recorder.state !== "inactive") recorder.stop(); } catch {}
    chunks = [];
  }

  return { stop, cancel };
}

/**
 * IndexedDB store for raw clip blobs that are too large for sessionStorage.
 * Key = `${runId}-${slot}`.
 */
const DB_NAME = "snapvibe-live";
const STORE = "clips";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function storeClip(runId: string, slot: number, clip: LiveClip): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(clip.blob, `${runId}-${slot}`);
  tx.objectStore(STORE).put({ mime: clip.mime, durationMs: clip.durationMs }, `meta-${runId}-${slot}`);
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  db.close();
}

export async function takeClip(runId: string, slot: number): Promise<LiveClip | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const req = tx.objectStore(STORE).get(`${runId}-${slot}`);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    const meta = await new Promise<{ mime: string; durationMs: number } | null>((resolve, reject) => {
      const req = tx.objectStore(STORE).get(`meta-${runId}-${slot}`);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!blob || !meta) return null;
    return { blob, mime: meta.mime, durationMs: meta.durationMs };
  } catch {
    return null;
  }
}

export async function deleteRunClips(runId: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const keys = await new Promise<string[]>((resolve, reject) => {
      const req = store.getAllKeys();
      req.onsuccess = () => resolve((req.result as string[]).filter((k) => k.startsWith(runId)));
      req.onerror = () => reject(req.error);
    });
    for (const key of keys) store.delete(key);
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  } catch { /* best effort */ }
}
