import { timingSafeEqual } from "node:crypto";

import { and, count, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { photoSessions } from "@/db/schema";
import { destroyAsset, isCloudinaryConfigured } from "@/lib/cloudinary";
import { deleteStoredFile } from "@/lib/storage";

export const runtime = "nodejs";

// expires_at is stored as a naive UTC timestamp, so it is compared against the
// current UTC time explicitly rather than the session-local now().
//
// published_at is deliberately excluded from expiry: a guest who ticked
// "publish" expects their strip to stay in the public gallery, so those rows
// are permanent. An admin can remove it from the gallery first, which makes the
// row eligible again and lets this job reclaim both copies.
const expiredCutoff = and(
  sql`${photoSessions.expiresAt} < (now() at time zone 'utc')`,
  isNull(photoSessions.publishedAt),
);

// Vercel Cron (and most schedulers) send `Authorization: Bearer <secret>`.
// Production fails closed when CRON_SECRET is missing so an unconfigured
// deployment never exposes an unauthenticated delete endpoint; local dev stays
// convenient. The comparison is length-checked and timing-safe.
function denyUnauthorized(request: Request): Response | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return Response.json(
        { error: "CRON_SECRET belum diset di environment" },
        { status: 503 },
      );
    }
    return null;
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const expectedBytes = Buffer.from(secret, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");

  const matches =
    expectedBytes.length === providedBytes.length &&
    timingSafeEqual(expectedBytes, providedBytes);

  return matches
    ? null
    : Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  const denied = denyUnauthorized(request);
  if (denied) return denied;

  const expired = await db
    .select({
      id: photoSessions.id,
      finalPhotoUrl: photoSessions.finalPhotoUrl,
      cloudinaryPublicId: photoSessions.cloudinaryPublicId,
    })
    .from(photoSessions)
    .where(expiredCutoff);

  // Keep a row when its Cloudinary copy could not be destroyed. Deleting the
  // row would orphan the asset, and no admin screen could ever find it again.
  const removableIds: string[] = [];
  let cloudinaryRemoved = 0;
  let cloudinaryFailed = 0;

  for (const row of expired) {
    if (!row.cloudinaryPublicId) {
      removableIds.push(row.id);
      continue;
    }

    if (!isCloudinaryConfigured()) {
      cloudinaryFailed += 1;
      continue;
    }

    try {
      const removed = await destroyAsset(row.cloudinaryPublicId);
      if (removed) {
        cloudinaryRemoved += 1;
        removableIds.push(row.id);
      } else {
        cloudinaryFailed += 1;
      }
    } catch {
      cloudinaryFailed += 1;
    }
  }

  let filesRemoved = 0;
  for (const row of expired) {
    if (!removableIds.includes(row.id)) continue;

    const filename = row.finalPhotoUrl.split("/").pop() ?? "";
    // Row deletion must still proceed when the file is already gone.
    if (await deleteStoredFile(filename)) {
      filesRemoved += 1;
    }
  }

  if (removableIds.length > 0) {
    await db
      .delete(photoSessions)
      .where(
        and(
          expiredCutoff,
          inArray(photoSessions.id, removableIds),
        ),
      );
  }

  // Surfaced so a retention run shows published photos were held back on
  // purpose rather than silently missed.
  const [kept] = await db
    .select({ n: count() })
    .from(photoSessions)
    .where(
      and(
        sql`${photoSessions.expiresAt} < (now() at time zone 'utc')`,
        isNotNull(photoSessions.publishedAt),
      ),
    );

  return Response.json({
    sessionsRemoved: removableIds.length,
    filesRemoved,
    cloudinaryRemoved,
    cloudinaryFailed,
    publishedKept: kept?.n ?? 0,
    ranAt: new Date().toISOString(),
  });
}

export const GET = POST;
