import { and, desc, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { photoSessions } from "@/db/schema";

/**
 * A published strip's Live Photo slots. The stored URL is deliberately left out:
 * it is named after the session's access key, which is the capability that
 * opens the private result page. The gallery streams a clip through
 * `/api/gallery/live/[id]/[slot]` instead.
 */
export type GalleryLiveClip = { slot: number };

export type GalleryPhoto = {
  id: string;
  cloudinaryUrl: string;
  layoutType: string;
  filterKey: string;
  publishedAt: string;
  /** Present only for strips recorded with the camera's Live toggle on. */
  live?: GalleryLiveClip[];
};

/**
 * Shared public-gallery query for both the API and server-rendered gallery
 * page. The projection never includes accessKey, finalPhotoUrl, expiresAt, or a
 * clip URL.
 */
export async function getPublicGallery(limit = 60): Promise<GalleryPhoto[]> {
  const rows = await db
    .select({
      id: photoSessions.id,
      cloudinaryUrl: photoSessions.cloudinaryUrl,
      layoutType: photoSessions.layoutType,
      filterKey: photoSessions.filterKey,
      publishedAt: photoSessions.publishedAt,
      liveClips: photoSessions.liveClips,
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

  return rows.flatMap((row) => {
    if (!row.cloudinaryUrl) return [];

    const live = Array.isArray(row.liveClips)
      ? row.liveClips
          .filter((clip) => Number.isInteger(clip?.slot))
          .sort((a, b) => a.slot - b.slot)
          .map((clip) => ({ slot: clip.slot }))
      : [];

    return [
      {
        id: row.id,
        cloudinaryUrl: row.cloudinaryUrl,
        layoutType: row.layoutType,
        filterKey: row.filterKey,
        publishedAt: row.publishedAt?.toISOString() ?? "",
        ...(live.length > 0 ? { live } : {}),
      },
    ];
  });
}
