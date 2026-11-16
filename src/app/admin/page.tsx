import { count, desc, sql, sum } from "drizzle-orm";
import type { Metadata } from "next";

import { AdminDashboard } from "@/components/admin-dashboard";
import { AdminLogin } from "@/components/admin-login";
import { db } from "@/db";
import { frames, photoSessions } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Admin: StripSnap",
  description: "Kelola frame, sesi, dan retensi foto.",
  robots: { index: false, follow: false },
};

// expires_at stores naive UTC, so "active" is compared against UTC explicitly
// instead of the server session's local now(), the same rule the cleanup job uses.
const ACTIVE_SESSION = sql`${photoSessions.expiresAt} > (now() at time zone 'utc')`;

export default async function AdminPage() {
  const admin = await requireAdmin();
  if (!admin) return <AdminLogin />;

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
    })
    .from(frames)
    .orderBy(desc(frames.createdAt));

  return (
    <AdminDashboard
      frames={frameRows}
      totals={{
        frames: frameRows.length,
        sessions: Number(totals?.sessions ?? 0),
        activeSessions: Number(totals?.activeSessions ?? 0),
        downloads: Number(totals?.downloads ?? 0),
      }}
    />
  );
}
