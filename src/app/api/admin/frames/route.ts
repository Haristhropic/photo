import { randomUUID } from "node:crypto";

import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { events, frames } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { isLayoutType } from "@/lib/layouts";
import { savePng } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const fields = z.object({
  name: z.string().min(1).max(120),
  layoutType: z.string(),
  eventId: z.string().uuid().nullish(),
});

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Body harus berupa form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "File PNG wajib diunggah" }, { status: 400 });
  }
  if (file.size > MAX_FRAME_BYTES) {
    return Response.json({ error: "File terlalu besar" }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    return Response.json({ error: "File bukan PNG yang valid" }, { status: 415 });
  }

  const parsed = fields.safeParse({
    name: form.get("name"),
    layoutType: form.get("layoutType"),
    eventId: form.get("eventId") || null,
  });
  if (!parsed.success) {
    return Response.json({ error: "Data frame tidak valid" }, { status: 400 });
  }
  if (!isLayoutType(parsed.data.layoutType)) {
    return Response.json({ error: "Layout tidak dikenal" }, { status: 400 });
  }

  const id = randomUUID();
  const imageUrl = await savePng(bytes, `frame-${id}.png`);

  await db.insert(frames).values({
    id,
    name: parsed.data.name,
    imageUrl,
    layoutType: parsed.data.layoutType,
    eventId: parsed.data.eventId ?? null,
  });

  return Response.json({ id, imageUrl, name: parsed.data.name }, { status: 201 });
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Restrict to frames on events this admin owns, plus unassigned frames.
  const owned = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.creatorId, admin.id));

  const ownedIds = owned.map((row) => row.id);

  const rows = await db
    .select({
      id: frames.id,
      name: frames.name,
      imageUrl: frames.imageUrl,
      layoutType: frames.layoutType,
      eventId: frames.eventId,
      eventTitle: events.title,
      createdAt: frames.createdAt,
    })
    .from(frames)
    .leftJoin(events, eq(frames.eventId, events.id))
    .orderBy(desc(frames.createdAt));

  const visible =
    ownedIds.length === 0
      ? rows.filter((row) => row.eventId === null)
      : rows.filter((row) => row.eventId === null || ownedIds.includes(row.eventId));

  return Response.json({ frames: visible });
}
