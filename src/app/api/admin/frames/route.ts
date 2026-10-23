import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { events, frames } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { isFrameCategory } from "@/lib/frames";
import { analyzeFramePng } from "@/lib/frame-image";
import { storeFramePng } from "@/lib/frame-assets";
import { isLayoutType } from "@/lib/layouts";

export const runtime = "nodejs";

const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const fields = z.object({
  name: z.string().trim().min(1).max(120),
  layoutType: z.string(),
  eventId: z.string().uuid().nullish(),
  category: z.string().optional(),
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
    category: form.get("category") || undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: "Data frame tidak valid" }, { status: 400 });
  }
  if (!isLayoutType(parsed.data.layoutType)) {
    return Response.json({ error: "Layout tidak dikenal" }, { status: 400 });
  }
  const category = parsed.data.category ?? "cool";
  if (!isFrameCategory(category)) {
    return Response.json({ error: "Kategori frame tidak dikenal" }, { status: 400 });
  }

  const eventId = parsed.data.eventId ?? null;
  if (eventId) {
    const [target] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.creatorId, admin.id)))
      .limit(1);
    if (!target) {
      return Response.json({ error: "Event tidak ditemukan" }, { status: 404 });
    }
  }

  let analysis;
  try {
    analysis = await analyzeFramePng(bytes);
  } catch {
    return Response.json(
      { error: "PNG tidak bisa dibaca atau terlalu besar" },
      { status: 400 },
    );
  }
  if (analysis.width < 120 || analysis.height < 120) {
    return Response.json({ error: "Ukuran frame terlalu kecil" }, { status: 400 });
  }

  const id = randomUUID();
  let stored;
  try {
    stored = await storeFramePng(bytes, `frame-${id}`);
  } catch (error) {
    console.error("frame upload failed:", error);
    return Response.json(
      { error: "Gagal mengunggah frame ke Cloudinary" },
      { status: 502 },
    );
  }

  await db.insert(frames).values({
    id,
    name: parsed.data.name.trim(),
    imageUrl: stored.imageUrl,
    imagePublicId: stored.imagePublicId,
    imageWidth: analysis.width,
    imageHeight: analysis.height,
    windows: analysis.windows,
    category,
    layoutType: parsed.data.layoutType,
    eventId,
  });

  return Response.json(
    {
      id,
      imageUrl: stored.imageUrl,
      name: parsed.data.name.trim(),
      storage: stored.storage,
      width: analysis.width,
      height: analysis.height,
      windowCount: analysis.windows.length,
    },
    { status: 201 },
  );
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
      imagePublicId: frames.imagePublicId,
      imageWidth: frames.imageWidth,
      imageHeight: frames.imageHeight,
      windows: frames.windows,
      category: frames.category,
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

  return Response.json({
    frames: visible.map((row) => ({
      ...row,
      storage: row.imagePublicId ? "cloudinary" : "local",
      windowCount: row.windows.length,
    })),
  });
}
