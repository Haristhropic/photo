import { and, desc, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { photoSessions } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 120;

/**
 * Public gallery feed. Only photos whose guest ticked "publish" appear, and the
 * projection deliberately omits `accessKey`, `finalPhotoUrl`, and `expiresAt`:
 * the access key is the capability that reaches a private photo, so it must
 * never ride along on a list meant for anonymous visitors.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requested = Number.parseInt(
    searchParams.get("limit") ?? "",
    10,
  );
  const limit = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const rows = await db
    .select({
      id: photoSessions.id,
      cloudinaryUrl: photoSessions.cloudinaryUrl,
      layoutType: photoSessions.layoutType,
      filterKey: photoSessions.filterKey,
      publishedAt: photoSessions.publishedAt,
    })
    .from(photoSessions)
    .where(
      and(
        isNotNull(photoSessions.publishedAt),
        isNotNull(photoSessions.cloudinaryUrl),
      ),
    )
    .orderBy(desc(photoSessions.publishedAt))
    .limit(limit);

  return Response.json(
    { photos: rows },
    {
      headers: {
        // Anonymous and consent-gated, so never let a CDN hold it.
        "Cache-Control": "no-store",
      },
    },
  );
}
