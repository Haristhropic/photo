import { count, desc, eq, sql, sum } from "drizzle-orm";
import type { Metadata } from "next";

import { AdminDashboard } from "@/components/admin-dashboard";
import { AdminLogin } from "@/components/admin-login";
import { db } from "@/db";
import { events, frames, photoSessions } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Admin: StripSnap",
  description: "Kelola event, frame, dan retensi foto.",
  robots: { index: false, follow: false },
};

// expires_at stores naive UTC, so "active" is compared against UTC explicitly
// instead of the server session's local now(), the same rule the cleanup job uses.
const ACTIVE_SESSION = sql`${photoSessions.expiresAt} > (now() at time zone 'utc')`;

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
      createdAt: events.createdAt,
      sessionCount: count(photoSessions.id),
      downloadTotal: sum(photoSessions.downloadCount),
      activeSessions: sql<number>`count(${photoSessions.id}) filter (where ${ACTIVE_SESSION})`,
      nextExpiry: sql<string | null>`to_char(min(${photoSessions.expiresAt}) filter (where ${ACTIVE_SESSION}), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
    })
    .from(events)
    .leftJoin(photoSessions, eq(photoSessions.eventId, events.id))
    .groupBy(events.id)
    .orderBy(desc(events.createdAt));

  const [totals] = await db
    .select({
      sessions: count(photoSessions.id),
      downloads: sum(photoSessions.downloadCount),
      activeSessions: sql<number>`count(*) filter (where ${ACTIVE_SESSION})`,
    })
    .from(photoSessions);

  const frameRows = await db
    .select({
      id: frames.id,
      name: frames.name,
      imageUrl: frames.imageUrl,
      imagePublicId: frames.imagePublicId,
      imageWidth: frames.imageWidth,
      imageHeight: frames.imageHeight,
      windows: frames.windows,
      category: frames.category,
      layoutType: frames.layoutType,
      eventId: frames.eventId,
      eventTitle: events.title,
    })
    .from(frames)
    .leftJoin(events, eq(frames.eventId, events.id))
    .orderBy(desc(frames.createdAt));

  const eventIds = new Set(rows.map((row) => row.id));
  const visibleFrames = frameRows.filter(
    (frame) => frame.eventId === null || eventIds.has(frame.eventId),
  );

  const frameCountByEvent = new Map<string, number>();
  for (const frame of visibleFrames) {
    if (!frame.eventId) continue;
    frameCountByEvent.set(
      frame.eventId,
      (frameCountByEvent.get(frame.eventId) ?? 0) + 1,
    );
  }

  const eventRows = rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    accessCode: row.accessCode,
    retentionHours: row.retentionHours,
    createdAt: row.createdAt.toISOString(),
    sessionCount: Number(row.sessionCount ?? 0),
    downloadTotal: Number(row.downloadTotal ?? 0),
    activeSessions: Number(row.activeSessions ?? 0),
    nextExpiry: row.nextExpiry ?? null,
    frameCount: frameCountByEvent.get(row.id) ?? 0,
  }));

  return (
    <AdminDashboard
      events={eventRows}
      frames={visibleFrames}
      totals={{
        events: eventRows.length,
        frames: visibleFrames.length,
        sessions: Number(totals?.sessions ?? 0),
        activeSessions: Number(totals?.activeSessions ?? 0),
        downloads: Number(totals?.downloads ?? 0),
      }}
    />
  );
}
