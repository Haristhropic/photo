import { and, count, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { Metadata } from "next";

import { AdminHeader } from "@/components/admin-header";
import { AdminLogin } from "@/components/admin-login";
import { AdminStorage, type StoragePhoto } from "@/components/admin-storage";
import { db } from "@/db";
import { events, photoSessions } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Storage: SnapVibe Admin",
  description: "Kontrol foto yang tampil di galeri publik SnapVibe.",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 24;

const publicPhotoWhere = and(
  isNotNull(photoSessions.publishedAt),
  isNotNull(photoSessions.cloudinaryUrl),
);

export default async function AdminStoragePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  if (!admin) return <AdminLogin />;

  const searchParams = await props.searchParams;
  const rawPage = Array.isArray(searchParams.page)
    ? searchParams.page[0]
    : searchParams.page;
  const parsedPage = Number.parseInt(rawPage ?? "", 10);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const [[publicCount], [privateCount], [totalCount]] = await Promise.all([
    db
      .select({ n: count() })
      .from(photoSessions)
      .where(publicPhotoWhere),
    db
      .select({ n: count() })
      .from(photoSessions)
      .where(isNull(photoSessions.publishedAt)),
    db.select({ n: count() }).from(photoSessions),
  ]);

  const publicPhotos = Number(publicCount?.n ?? 0);
  const totalPages = Math.max(1, Math.ceil(publicPhotos / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const rows = await db
    .select({
      id: photoSessions.id,
      cloudinaryUrl: photoSessions.cloudinaryUrl,
      layoutType: photoSessions.layoutType,
      filterKey: photoSessions.filterKey,
      publishedAt: photoSessions.publishedAt,
      eventTitle: events.title,
    })
    .from(photoSessions)
    .leftJoin(events, eq(photoSessions.eventId, events.id))
    .where(publicPhotoWhere)
    .orderBy(desc(photoSessions.publishedAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const photos: StoragePhoto[] = rows.flatMap((row) =>
    row.cloudinaryUrl
      ? [
          {
            id: row.id,
            cloudinaryUrl: row.cloudinaryUrl,
            layoutType: row.layoutType,
            filterKey: row.filterKey,
            publishedAt: row.publishedAt?.toISOString() ?? "",
            eventTitle: row.eventTitle,
          },
        ]
      : [],
  );

  return (
    <div className="flex flex-1 flex-col">
      <AdminHeader active="storage" />
      <AdminStorage
        photos={photos}
        totals={{
          publicPhotos,
          privateSessions: Number(privateCount?.n ?? 0),
          totalSessions: Number(totalCount?.n ?? 0),
        }}
        page={page}
        totalPages={totalPages}
      />
    </div>
  );
}
