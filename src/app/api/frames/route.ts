import { asc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { frames } from "@/db/schema";
import type { DynamicFrameRecord } from "@/lib/frames";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const eventIdSchema = z.string().uuid();

/**
 * Public frame catalogue for the studio. It contains global frames plus the
 * frames assigned to the event the guest came from. Nothing here is secret:
 * the overlay URLs are delivered publicly by Cloudinary anyway.
 */
export async function GET(request: Request) {
  const rawEventId = new URL(request.url).searchParams.get("eventId");
  let eventId: string | null = null;

  if (rawEventId) {
    const parsed = eventIdSchema.safeParse(rawEventId);
    if (!parsed.success) {
      return Response.json({ error: "Event tidak valid" }, { status: 400 });
    }
    eventId = parsed.data;
  }

  const rows = await db
    .select({
      id: frames.id,
      name: frames.name,
      imageUrl: frames.imageUrl,
      imageWidth: frames.imageWidth,
      imageHeight: frames.imageHeight,
      windows: frames.windows,
      layoutType: frames.layoutType,
      category: frames.category,
    })
    .from(frames)
    .where(
      eventId
        ? or(isNull(frames.eventId), eq(frames.eventId, eventId))
        : isNull(frames.eventId),
    )
    .orderBy(asc(frames.createdAt));

  const payload: DynamicFrameRecord[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    imageUrl: row.imageUrl,
    imageWidth: row.imageWidth,
    imageHeight: row.imageHeight,
    windows: row.windows,
    layoutType: row.layoutType,
    category: row.category as DynamicFrameRecord["category"],
  }));

  return Response.json({ frames: payload });
}
