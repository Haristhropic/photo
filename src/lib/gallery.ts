import { and, desc, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { photoSessions } from "@/db/schema";
import { isRect, type Rect } from "@/lib/layouts";
import { storedFileExists, storedMediaFilename } from "@/lib/storage";

/**
 * A published strip's Live Photo slots. The stored URL is deliberately left out:
 * it is named after the session's access key, which is the capability that
 * opens the private result page. The gallery streams a clip through
 * `/api/gallery/live/[id]/[slot]` instead.
 *
 * `rect` is the printed photo window for strips rendered into a bitmap frame,
 * and `frameSrc` is that frame's artwork, which has to be repainted over a
 * playing clip. Without them the card falls back to the layout's own slots.
 */
export type GalleryLiveClip = { slot: number; rect?: Rect; frameSrc?: string };

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
 *
 * A row can outlive the object it points at, so a slot is only advertised once
 * its clip is actually in storage. Publishing the slot anyway would render a
 * LIVE badge that 404s the moment a guest taps it.
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

  const photos = await Promise.all(
    rows.map(async (row): Promise<GalleryPhoto | null> => {
      if (!row.cloudinaryUrl) return null;

      const clips = Array.isArray(row.liveClips)
        ? row.liveClips
            .filter((clip) => Number.isInteger(clip?.slot))
            .sort((a, b) => a.slot - b.slot)
        : [];

      const checked = await Promise.all(
        clips.map(async (clip) => {
          const filename = storedMediaFilename(clip.url);
          return {
            slot: clip.slot,
            rect: clip.rect,
            frameSrc: clip.frameSrc,
            available: filename ? await storedFileExists(filename) : false,
          };
        }),
      );

      const live = checked
        .filter((clip) => clip.available)
        .map((clip) => ({
          slot: clip.slot,
          ...(isRect(clip.rect) ? { rect: clip.rect } : {}),
          ...(typeof clip.frameSrc === "string" && clip.frameSrc.length > 0
            ? { frameSrc: clip.frameSrc }
            : {}),
        }));

      return {
        id: row.id,
        cloudinaryUrl: row.cloudinaryUrl,
        layoutType: row.layoutType,
        filterKey: row.filterKey,
        publishedAt: row.publishedAt?.toISOString() ?? "",
        ...(live.length > 0 ? { live } : {}),
      };
    }),
  );

  return photos.filter((photo): photo is GalleryPhoto => photo !== null);
}
