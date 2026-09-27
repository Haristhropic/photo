import { unlink } from "node:fs/promises";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { photoSessions } from "@/db/schema";
import { resolveStoredPath } from "@/lib/storage";

export const runtime = "nodejs";

// expires_at is stored as a naive UTC timestamp, so it is compared against the
// current UTC time explicitly rather than the session-local now().
const expiredCutoff = sql`${photoSessions.expiresAt} < (now() at time zone 'utc')`;

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

  return Response.json({
    sessionsRemoved: expired.length,
    filesRemoved,
    ranAt: new Date().toISOString(),
  });
}

export const GET = POST;
