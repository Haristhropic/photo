import { and, desc, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { photoSessions } from "@/db/schema";

export type GalleryPhoto = {
  id: string;
  cloudinaryUrl: string;
  layoutType: string;
  filterKey: string;
  publishedAt: string;
};

/**
 * Shared public-gallery query for both the API and server-rendered gallery
 * page. The projection never includes accessKey, finalPhotoUrl, or expiresAt.
 */
export async function getPublicGallery(limit = 60): Promise<GalleryPhoto[]> {
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

  return rows.flatMap((row) =>
    row.cloudinaryUrl
      ? [
          {
            id: row.id,
            cloudinaryUrl: row.cloudinaryUrl,
            layoutType: row.layoutType,
            filterKey: row.filterKey,
            publishedAt: row.publishedAt?.toISOString() ?? "",
          },
        ]
      : [],
  );
}
