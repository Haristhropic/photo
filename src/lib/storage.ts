import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { del, get, put } from "@vercel/blob";

// Paths under this root are joined from request data, so Turbopack cannot scope
// tracing to a literal subfolder and warns about whole-project tracing. The
// opt-outs below are deliberate: savePng accepts only a regex-validated
// basename, and resolveStoredPath enforces containment as the real boundary.
const STORAGE_ROOT = path.resolve(
  /*turbopackIgnore: true*/ process.cwd(),
  process.env.STORAGE_DIR || "./storage",
);

// Every public/private photo and the local frame fallback use a flat basename.
// Restricting Blob operations to the same shape means a crafted /api/files path
// can never read or delete an unrelated object from the store.
const SAFE_PNG_FILENAME = /^[a-zA-Z0-9_-]+\.png$/;
const SAFE_MEDIA_FILENAME = /^[a-zA-Z0-9_-]+\.(png|webm|mp4)$/;

export function storageRoot(): string {
  return STORAGE_ROOT;
}

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
};

export function contentTypeFor(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Vercel's filesystem is ephemeral, so a deployed instance must use object
 * storage. Development keeps the local-disk fallback when no token is present.
 */
export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

function blobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() || undefined;
}

function safeBlobFilename(relative: string): string | null {
  try {
    const decoded = decodeURIComponent(relative);
    return SAFE_MEDIA_FILENAME.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export async function savePng(bytes: Buffer, filename: string): Promise<string> {
  if (!SAFE_PNG_FILENAME.test(filename)) {
    throw new Error(`Unsafe filename rejected: ${filename}`);
  }

  if (isBlobConfigured()) {
    await put(filename, bytes, {
      access: "private",
      token: blobToken(),
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "image/png",
    });
    return `/api/files/${filename}`;
  }

  if (process.env.VERCEL) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN belum diset. Hubungkan Vercel Blob ke project ini sebelum menyimpan foto.",
    );
  }

  const target = path.join(/*turbopackIgnore: true*/ STORAGE_ROOT, filename);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return `/api/files/${filename}`;
}

export async function saveMedia(bytes: Uint8Array, filename: string, contentType: string): Promise<{ url: string }> {
  if (!SAFE_MEDIA_FILENAME.test(filename)) {
    throw new Error(`Unsafe filename rejected: ${filename}`);
  }

  if (isBlobConfigured()) {
    await put(filename, Buffer.from(bytes), {
      access: "private",
      token: blobToken(),
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
    });
    return { url: `/api/files/${filename}` };
  }

  if (process.env.VERCEL) {
    throw new Error("BLOB_READ_WRITE_TOKEN belum diset.");
  }

  const target = path.join(/*turbopackIgnore: true*/ STORAGE_ROOT, filename);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return { url: `/api/files/${filename}` };
}

/**
 * Resolves a request path inside the storage root. Returns null when the input
 * escapes the root via `..`, an absolute path, or a NUL byte.
 */
export function resolveStoredPath(relative: string): string | null {
  if (relative.includes("\0")) return null;
  const decoded = decodeURIComponent(relative);
  if (decoded.includes("\0")) return null;

  const resolved = path.resolve(/*turbopackIgnore: true*/ STORAGE_ROOT, decoded);
  const rootWithSep = STORAGE_ROOT.endsWith(path.sep)
    ? STORAGE_ROOT
    : STORAGE_ROOT + path.sep;

  if (resolved !== STORAGE_ROOT && !resolved.startsWith(rootWithSep)) {
    return null;
  }
  return resolved;
}

export async function readStoredFile(relative: string): Promise<Buffer | null> {
  if (isBlobConfigured()) {
    const filename = safeBlobFilename(relative);
    if (!filename) return null;

    try {
      const result = await get(filename, {
        access: "private",
        token: blobToken(),
      });
      if (!result?.stream) return null;
      return Buffer.from(await new Response(result.stream).arrayBuffer());
    } catch {
      return null;
    }
  }

  const resolved = resolveStoredPath(relative);
  if (!resolved) return null;
  try {
    return await readFile(/*turbopackIgnore: true*/ resolved);
  } catch {
    return null;
  }
}

/**
 * Removes one stored PNG from Blob or the local fallback. Returns false when the
 * object was already gone or the deletion failed, so callers can keep the DB row
 * rather than orphan a stored file.
 */
export async function deleteStoredFile(relative: string): Promise<boolean> {
  if (isBlobConfigured()) {
    const filename = safeBlobFilename(relative);
    if (!filename) return false;

    try {
      await del(filename, { token: blobToken() });
      return true;
    } catch {
      return false;
    }
  }

  const resolved = resolveStoredPath(relative);
  if (!resolved) return false;

  try {
    await unlink(resolved);
    return true;
  } catch {
    return false;
  }
}
