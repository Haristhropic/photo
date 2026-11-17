import { asc, eq } from "drizzle-orm";
import type { Hono } from "hono";

import { db } from "@/db";
import { frames, photoSessions } from "@/db/schema";
import type { DynamicFrameRecord } from "@/lib/frames";
import { getPublicGallery } from "@/lib/gallery";
import { serveMedia } from "@/lib/serve-media";
import {
  contentTypeFor,
  readStoredFile,
  storedMediaFilename,
} from "@/lib/storage";

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 120;

const SESSION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SLOT = 7;

function notFound(): Response {
  return Response.json({ error: "Not found" }, { status: 404 });
}

/** The file wildcard carries a decoded path, matching Next's catch-all params. */
function storedPathFromUrl(pathname: string): string {
  const raw = pathname.slice("/api/files/".length);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function registerPublicRoutes(app: Hono): void {
  /**
   * Public frame catalogue for the studio. Every stored frame is global.
   * Nothing here is secret: the overlay URLs are delivered publicly by
   * Cloudinary anyway.
   */
  app.get("/api/frames", async (c) => {
    const rows = await db
      .select({
        id: frames.id,
        name: frames.name,
        imageUrl: frames.imageUrl,
        imageWidth: frames.imageWidth,
        imageHeight: frames.imageHeight,
        windows: frames.windows,
        layoutType: frames.layoutType,
        category: frames.category,
      })
      .from(frames)
      .orderBy(asc(frames.createdAt));

    const payload: DynamicFrameRecord[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      imageUrl: row.imageUrl,
      imageWidth: row.imageWidth,
      imageHeight: row.imageHeight,
      windows: row.windows,
      layoutType: row.layoutType,
      category: row.category as DynamicFrameRecord["category"],
    }));

    return c.json({ frames: payload });
  });

  /**
   * Public gallery feed. Only photos whose guest ticked "publish" appear, and the
   * shared projection deliberately omits `accessKey`, `finalPhotoUrl`, and
   * `expiresAt`: the access key is the capability that reaches a private photo,
   * so it must never ride along on a list meant for anonymous visitors.
   */
  app.get("/api/gallery", async (c) => {
    const requested = Number.parseInt(c.req.query("limit") ?? "", 10);
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(requested, 1), MAX_LIMIT)
      : DEFAULT_LIMIT;

    const photos = await getPublicGallery(limit);

    // Anonymous and consent-gated, so never let a CDN hold it.
    return c.json({ photos }, 200, { "Cache-Control": "no-store" });
  });

  /**
   * Plays one Live Photo clip for a published strip.
   *
   * The gallery feed can never carry the clip URLs themselves: they are named
   * `<accessKey>-live<slot>.mp4`, and the access key is the capability that opens
   * the private result page. This route resolves a session id to its clip instead,
   * so a public visitor gets the motion without ever learning the key.
   */
  app.get("/api/gallery/live/:id/:slot", async (c) => {
    const id = c.req.param("id");
    const slotParam = c.req.param("slot");

    if (!SESSION_ID.test(id)) return notFound();

    const slot = Number.parseInt(slotParam, 10);
    if (!Number.isInteger(slot) || slot < 0 || slot > MAX_SLOT) return notFound();

    const [session] = await db
      .select({
        publishedAt: photoSessions.publishedAt,
        liveClips: photoSessions.liveClips,
      })
      .from(photoSessions)
      .where(eq(photoSessions.id, id))
      .limit(1);

    // Publishing is the guest's consent for a public photo. Published rows are
    // permanent — the retention job skips them — so `expiresAt` must not be
    // consulted here: it only governs the private copies, and checking it hid
    // the clips of every strip whose original session window had elapsed.
    if (!session || !session.publishedAt) {
      return notFound();
    }

    const clip = session.liveClips.find((entry) => entry.slot === slot);
    if (!clip) return notFound();

    const filename = storedMediaFilename(clip.url);
    if (!filename) return notFound();

    const bytes = await readStoredFile(filename);
    if (!bytes) return notFound();

    const contentType = clip.mime === "video/mp4" ? "video/mp4" : "video/webm";
    // Public feed and a permanent row, but an admin can unpublish or delete the
    // photo at any time, so let a CDN copy live for an hour instead of forever.
    return serveMedia(c.req.raw, bytes, contentType, "public, max-age=3600");
  });

  app.get("/api/files/*", async (c) => {
    const relative = storedPathFromUrl(c.req.path);

    const bytes = await readStoredFile(relative);
    if (!bytes) {
      return c.json({ error: "Not found" }, 404);
    }

    return serveMedia(
      c.req.raw,
      bytes,
      contentTypeFor(relative),
      "private, max-age=31536000, immutable",
    );
  });
}
