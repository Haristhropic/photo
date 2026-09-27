import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Paths under this root are joined from request data, so Turbopack cannot scope
// tracing to a literal subfolder and warns about whole-project tracing. The
// opt-outs below are deliberate: savePng accepts only a regex-validated
// basename, and resolveStoredPath enforces containment as the real boundary.
const STORAGE_ROOT = path.resolve(
  process.cwd(),
  process.env.STORAGE_DIR || "./storage",
);

export function storageRoot(): string {
  return STORAGE_ROOT;
}

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export function contentTypeFor(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export async function savePng(bytes: Buffer, filename: string): Promise<string> {
  if (!/^[a-zA-Z0-9_-]+\.png$/.test(filename)) {
    throw new Error(`Unsafe filename rejected: ${filename}`);
  }
  const target = path.join(/*turbopackIgnore: true*/ STORAGE_ROOT, filename);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return `/api/files/${filename}`;
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
  const resolved = resolveStoredPath(relative);
  if (!resolved) return null;
  try {
    return await readFile(resolved);
  } catch {
    return null;
  }
}
