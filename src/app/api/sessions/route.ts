import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { events, photoSessions } from "@/db/schema";
import { createAccessKey } from "@/lib/access-key";
import { isFilterKey, isLayoutType } from "@/lib/layouts";
import { savePng } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const DEFAULT_RETENTION_HOURS = 24;

const bodySchema = z.object({
  image: z.string().min(1),
  layoutType: z.string(),
  filterKey: z.string(),
  eventId: z.string().uuid().nullish(),
});

function decodePng(dataUrl: string): Buffer | null {
  const match = /^data:image\/png;base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) return null;
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
  return bytes;
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Body harus berupa JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "Data tidak valid" }, { status: 400 });
  }

  const { image, layoutType, filterKey, eventId } = parsed.data;
  if (!isLayoutType(layoutType) || !isFilterKey(filterKey)) {
    return Response.json({ error: "Layout atau filter tidak dikenal" }, { status: 400 });
  }

  const bytes = decodePng(image);
  if (!bytes) {
    return Response.json({ error: "Gambar PNG tidak valid" }, { status: 400 });
  }

  let retentionHours = DEFAULT_RETENTION_HOURS;
  if (eventId) {
    const [event] = await db
      .select({ retentionHours: events.retentionHours })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);
    if (!event) {
      return Response.json({ error: "Event tidak ditemukan" }, { status: 404 });
    }
    retentionHours = event.retentionHours;
  }

  const accessKey = createAccessKey(20);
  const filename = `${accessKey}.png`;
  const url = await savePng(bytes, filename);

  const expiresAt = new Date(
    Date.now() + retentionHours * 60 * 60 * 1000,
  );

  const id = randomUUID();

  await db.insert(photoSessions).values({
    id,
    eventId: eventId ?? null,
    finalPhotoUrl: url,
    accessKey,
    layoutType,
    filterKey,
    expiresAt,
  });

  return Response.json(
    {
      id,
      accessKey,
      url,
      expiresAt: expiresAt.toISOString(),
    },
    { status: 201 },
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accessKey = searchParams.get("accessKey");

  if (!accessKey) {
    return Response.json({ error: "accessKey wajib diisi" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(photoSessions)
    .where(eq(photoSessions.accessKey, accessKey))
    .limit(1);

  const session = rows[0];
  if (!session) {
    return Response.json({ error: "Sesi tidak ditemukan" }, { status: 404 });
  }

  return Response.json({
    accessKey: session.accessKey,
    url: session.finalPhotoUrl,
    layoutType: session.layoutType,
    filterKey: session.filterKey,
    downloadCount: session.downloadCount,
    expiresAt: session.expiresAt,
  });
}
