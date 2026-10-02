import { count, desc, eq, sum } from "drizzle-orm";
import type { Metadata } from "next";

import { AdminDashboard } from "@/components/admin-dashboard";
import { AdminLogin } from "@/components/admin-login";
import { db } from "@/db";
import { events, frames, photoSessions } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Admin: SnapVibe",
  description: "Kelola event, frame, dan retensi foto.",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const admin = await requireAdmin();
  if (!admin) return <AdminLogin />;

  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      accessCode: events.accessCode,
      retentionHours: events.retentionHours,
      sessionCount: count(photoSessions.id),
      downloadTotal: sum(photoSessions.downloadCount),
    })
    .from(events)
    .leftJoin(photoSessions, eq(photoSessions.eventId, events.id))
    .groupBy(events.id)
    .orderBy(desc(events.createdAt));

  const eventRows = rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    accessCode: row.accessCode,
    retentionHours: row.retentionHours,
    sessionCount: Number(row.sessionCount ?? 0),
    downloadTotal: Number(row.downloadTotal ?? 0),
  }));

  const [totals] = await db
    .select({
      sessions: count(photoSessions.id),
      downloads: sum(photoSessions.downloadCount),
    })
    .from(photoSessions);

  const frameRows = await db
    .select({
      id: frames.id,
      name: frames.name,
      imageUrl: frames.imageUrl,
      layoutType: frames.layoutType,
      eventId: frames.eventId,
      eventTitle: events.title,
    })
    .from(frames)
    .leftJoin(events, eq(frames.eventId, events.id))
    .orderBy(desc(frames.createdAt));

  const visibleFrames = frameRows.filter(
    (frame) => frame.eventId === null || eventRows.some((e) => e.id === frame.eventId),
  );

  return (
    <AdminDashboard
      events={eventRows}
      frames={visibleFrames}
      totals={{
        sessions: Number(totals?.sessions ?? 0),
        downloads: Number(totals?.downloads ?? 0),
      }}
    />
  );
}
