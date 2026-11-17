import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";

import { db } from "@/db";
import { photoSessions } from "@/db/schema";
import { createAccessKey } from "@/lib/access-key";
import {
  destroyAsset,
  isCloudinaryConfigured,
  uploadStripPng,
} from "@/lib/cloudinary";
import { LAYOUTS, isFilterKey, isLayoutType } from "@/lib/layouts";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { contentTypeFor, readStoredFile, savePng, saveMedia } from "@/lib/storage";

const MAX_IMAGE_BYTES = (process.env.VERCEL ? 4 : 12) * 1024 * 1024;
// Base64 inflates by ~4/3, so cap the JSON envelope a little above the decoded
// image limit. Vercel also caps a serverless request body at 4.5 MB, so the
// browser sends raw PNG bytes and keeps the JSON path for local scripts.
const MAX_BODY_BYTES = process.env.VERCEL
  ? Math.floor(4.5 * 1024 * 1024)
  : 16 * 1024 * 1024;
const DEFAULT_RETENTION_HOURS = 24;
// One strip is one request, so this is far above any real booth's throughput
// while still capping how fast a single client can fill storage or Cloudinary.
const UPLOAD_LIMIT = 300;
const UPLOAD_WINDOW_MS = 10 * 60 * 1000;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const SAFE_ACCESS_KEY = /^[a-z0-9]{20}$/;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB per clip
const MAX_TOTAL_SIZE = 8 * 1024 * 1024; // 8MB total
const LIVE_LIMIT = 300;
const LIVE_WINDOW_MS = 10 * 60 * 1000;

const bodySchema = z.object({
  image: z.string().min(1),
  layoutType: z.string(),
  filterKey: z.string(),
  publish: z.boolean().optional().default(false),
});

const uploadHeaderSchema = z.object({
  layoutType: z.string(),
  filterKey: z.string(),
  publish: z.boolean(),
});

type SessionInput = {
  bytes: Buffer;
  layoutType: string;
  filterKey: string;
  publish: boolean;
};

function tooLarge(): Response {
  return Response.json(
    {
      error:
        "Gambar terlalu besar untuk diunggah. Coba layout yang lebih kecil.",
    },
    { status: 413 },
  );
}

function isPng(bytes: Buffer): boolean {
  return (
    bytes.byteLength >= PNG_SIGNATURE.length &&
    bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  );
}

function decodePng(dataUrl: string): Buffer | null {
  const match = /^data:image\/png;base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) return null;
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
  // The data-URL prefix is client-supplied. Only store real PNGs so a crafted
  // request cannot park arbitrary bytes in storage under an image/png name.
  if (!isPng(bytes)) {
    return null;
  }
  return bytes;
}

async function parseSessionInput(
  request: Request,
): Promise<SessionInput | Response> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return tooLarge();
  }

  const contentType = (request.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (contentType === "image/png") {
    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.byteLength === 0 || !isPng(bytes)) {
      return Response.json({ error: "Gambar PNG tidak valid" }, { status: 400 });
    }
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return tooLarge();
    }

    const headers = uploadHeaderSchema.safeParse({
      layoutType: request.headers.get("x-layout-type") ?? "",
      filterKey: request.headers.get("x-filter-key") ?? "",
      publish: request.headers.get("x-publish") === "true",
    });
    if (!headers.success) {
      return Response.json({ error: "Data tidak valid" }, { status: 400 });
    }

    return {
      bytes,
      layoutType: headers.data.layoutType,
      filterKey: headers.data.filterKey,
      publish: headers.data.publish,
    };
  }

  // JSON remains supported for local scripts, e2e suites, and older clients.
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Body harus berupa JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "Data tidak valid" }, { status: 400 });
  }

  const bytes = decodePng(parsed.data.image);
  if (!bytes) {
    return Response.json({ error: "Gambar PNG tidak valid" }, { status: 400 });
  }

  return {
    bytes,
    layoutType: parsed.data.layoutType,
    filterKey: parsed.data.filterKey,
    publish: parsed.data.publish,
  };
}

function isMp4(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  );
}

function isWebm(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  );
}

export function registerSessionRoutes(app: Hono): void {
  app.post("/api/sessions", async (c) => {
    const key = clientKey(c.req.raw);
    if (key) {
      const limited = rateLimit(`session:${key}`, UPLOAD_LIMIT, UPLOAD_WINDOW_MS);
      if (!limited.allowed) return tooManyRequests(limited.retryAfter);
    }

    const input = await parseSessionInput(c.req.raw);
    if (input instanceof Response) return input;

    const { bytes, layoutType, filterKey, publish } = input;
    if (!isLayoutType(layoutType) || !isFilterKey(filterKey)) {
      return c.json({ error: "Layout atau filter tidak dikenal" }, 400);
    }

    const retentionHours = DEFAULT_RETENTION_HOURS;

    const accessKey = createAccessKey(20);
    const filename = `${accessKey}.png`;
    const url = await savePng(bytes, filename);

    const expiresAt = new Date(Date.now() + retentionHours * 60 * 60 * 1000);

    const id = randomUUID();

    let publishedAt: Date | null = null;
    let cloudinaryPublicId: string | null = null;
    let cloudinaryUrl: string | null = null;

    // A guest ticking "publish" wants their strip in the public gallery, so a
    // Cloudinary failure must not silently drop the session. The photo is
    // already on disk at this point, so we still return 201 with published=false
    // and let the client tell the guest it did not make the gallery.
    if (publish) {
      if (!isCloudinaryConfigured()) {
        console.error("publish requested but CLOUDINARY_URL is not set");
      } else {
        try {
          // Keyed on the row id, never the accessKey. accessKey is the capability
          // that reaches /p/[accessKey] and the download endpoint, and a published
          // asset's URL is permanently public and cacheable, so embedding it there
          // would hand that capability to anyone who copies the image link.
          const uploaded = await uploadStripPng(bytes, id);
          publishedAt = new Date();
          cloudinaryPublicId = uploaded.publicId;
          cloudinaryUrl = uploaded.secureUrl;
        } catch (error) {
          console.error("cloudinary upload failed:", error);
        }
      }
    }

    // A publish uploads to Cloudinary before the row exists. If the insert then
    // fails, the asset would sit in the bucket forever with no row pointing at it
    // and nothing in the retention job able to reclaim it, so roll it back.
    try {
      await db.insert(photoSessions).values({
        id,
        finalPhotoUrl: url,
        accessKey,
        layoutType,
        filterKey,
        expiresAt,
        publishedAt,
        cloudinaryPublicId,
        cloudinaryUrl,
      });
    } catch (error) {
      if (cloudinaryPublicId) {
        try {
          await destroyAsset(cloudinaryPublicId);
        } catch {
          // Best effort: the guest's photo is already saved locally either way.
        }
      }
      throw error;
    }

    return c.json(
      {
        id,
        accessKey,
        url,
        published: publishedAt !== null,
        expiresAt: expiresAt.toISOString(),
      },
      201,
    );
  });

  app.get("/api/sessions", async (c) => {
    const accessKey = c.req.query("accessKey");

    if (!accessKey) {
      return c.json({ error: "accessKey wajib diisi" }, 400);
    }

    const rows = await db
      .select()
      .from(photoSessions)
      .where(eq(photoSessions.accessKey, accessKey))
      .limit(1);

    const session = rows[0];
    if (!session) {
      return c.json({ error: "Sesi tidak ditemukan" }, 404);
    }

    return c.json({
      accessKey: session.accessKey,
      url: session.finalPhotoUrl,
      layoutType: session.layoutType,
      filterKey: session.filterKey,
      downloadCount: session.downloadCount,
      expiresAt: session.expiresAt,
    });
  });

  app.get("/api/sessions/:accessKey/download", async (c) => {
    const { accessKey } = c.req.param();

    const [session] = await db
      .select()
      .from(photoSessions)
      .where(eq(photoSessions.accessKey, accessKey))
      .limit(1);

    if (!session) {
      return c.json({ error: "Sesi tidak ditemukan" }, 404);
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      return c.json({ error: "Sesi sudah kedaluwarsa" }, 410);
    }

    const filename = session.finalPhotoUrl.split("/").pop() ?? "";
    const bytes = await readStoredFile(filename);
    if (!bytes) {
      return c.json({ error: "File tidak ditemukan" }, 404);
    }

    // Returning the incremented value keeps the number exact when two downloads
    // overlap, where the client could not work it out for itself.
    const [updated] = await db
      .update(photoSessions)
      .set({ downloadCount: sql`${photoSessions.downloadCount} + 1` })
      .where(eq(photoSessions.id, session.id))
      .returning({ downloadCount: photoSessions.downloadCount });

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentTypeFor(filename),
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename="snapvibe-${accessKey}.png"`,
        // The result page reads this after the file lands so the tally updates
        // without a reload.
        "X-Download-Count": String(
          updated?.downloadCount ?? session.downloadCount + 1,
        ),
        "Cache-Control": "no-store",
      },
    });
  });

  app.post("/api/sessions/:accessKey/live", async (c) => {
    const key = clientKey(c.req.raw);
    if (key) {
      const limited = rateLimit(`live:${key}`, LIVE_LIMIT, LIVE_WINDOW_MS);
      if (!limited.allowed) return tooManyRequests(limited.retryAfter);
    }

    const { accessKey } = c.req.param();
    if (!SAFE_ACCESS_KEY.test(accessKey)) {
      return c.json({ error: "Invalid access key" }, 400);
    }

    const [session] = await db
      .select({
        id: photoSessions.id,
        layoutType: photoSessions.layoutType,
        expiresAt: photoSessions.expiresAt,
      })
      .from(photoSessions)
      .where(eq(photoSessions.accessKey, accessKey))
      .limit(1);

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    if (session.expiresAt < new Date()) {
      return c.json({ error: "Session expired" }, 410);
    }

    const layout = LAYOUTS[session.layoutType];
    if (!layout) {
      return c.json({ error: "Invalid layout" }, 400);
    }

    const form = await c.req.formData();
    const entries: { slot: number; mime: string; durationMs: number; url: string }[] =
      [];
    let totalSize = 0;

    for (let slot = 0; slot < layout.shotCount; slot++) {
      const file = form.get(`slot-${slot}`) as File | null;
      if (!file) continue;

      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length > MAX_FILE_SIZE) {
        return c.json({ error: `Clip ${slot} exceeds 2MB` }, 413);
      }

      totalSize += bytes.length;
      if (totalSize > MAX_TOTAL_SIZE) {
        return c.json({ error: "Total clips exceed 8MB" }, 413);
      }

      const isValidMp4 = isMp4(bytes);
      const isValidWebm = isWebm(bytes);
      if (!isValidMp4 && !isValidWebm) {
        return c.json({ error: `Clip ${slot} is not a valid video` }, 400);
      }

      const ext = isValidMp4 ? "mp4" : "webm";
      const mime = isValidMp4 ? "video/mp4" : "video/webm";
      const filename = `${accessKey}-live${slot}.${ext}`;

      const stored = await saveMedia(bytes, filename, mime);
      entries.push({ slot, mime, durationMs: 2000, url: stored.url });
    }

    if (entries.length === 0) {
      return c.json({ error: "No clips provided" }, 400);
    }

    await db
      .update(photoSessions)
      .set({ liveClips: entries })
      .where(eq(photoSessions.id, session.id));

    return c.body(null, 204);
  });
}
