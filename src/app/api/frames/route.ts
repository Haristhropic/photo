import { asc } from "drizzle-orm";

import { db } from "@/db";
import { frames } from "@/db/schema";
import type { DynamicFrameRecord } from "@/lib/frames";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public frame catalogue for the studio. Every stored frame is global.
 * Nothing here is secret: the overlay URLs are delivered publicly by
 * Cloudinary anyway.
 */
export async function GET() {
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
