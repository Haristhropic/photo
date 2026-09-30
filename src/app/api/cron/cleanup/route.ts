import { unlink } from "node:fs/promises";

import { and, count, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { photoSessions } from "@/db/schema";
import { resolveStoredPath } from "@/lib/storage";

export const runtime = "nodejs";

// expires_at is stored as a naive UTC timestamp, so it is compared against the
// current UTC time explicitly rather than the session-local now().
//
// published_at is deliberately excluded from expiry: a guest who ticked
// "publish" expects their strip to stay in the public gallery, so those rows
// are permanent. Their Cloudinary asset is the gallery's copy, which is why
// destroying it here would leave the feed pointing at a dead URL.
const expiredCutoff = and(
  sql`${photoSessions.expiresAt} < (now() at time zone 'utc')`,
  isNull(photoSessions.publishedAt),
);

export async function POST() {
  const expired = await db
    .select({
      id: photoSessions.id,
      finalPhotoUrl: photoSessions.finalPhotoUrl,
    })
    .from(photoSessions)
    .where(expiredCutoff);

  let filesRemoved = 0;
  for (const row of expired) {
    const filename = row.finalPhotoUrl.split("/").pop() ?? "";
    const target = resolveStoredPath(filename);
    if (target) {
      try {
        await unlink(target);
        filesRemoved += 1;
      } catch {
        // Row deletion must still proceed when the file is already gone.
      }
    }
  }

  await db
    .delete(photoSessions)
    .where(expiredCutoff);

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
    sessionsRemoved: expired.length,
    filesRemoved,
    publishedKept: kept?.n ?? 0,
    ranAt: new Date().toISOString(),
  });
}

export const GET = POST;
