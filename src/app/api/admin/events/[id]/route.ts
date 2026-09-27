import { unlink } from "node:fs/promises";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { events, frames, photoSessions } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { slugify } from "@/lib/access-key";
import { resolveStoredPath } from "@/lib/storage";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    title: z.string().min(1).max(160).optional(),
    accessCode: z.string().max(64).nullish(),
    retentionHours: z.number().int().min(1).max(24 * 30).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Tidak ada field yang diubah",
  });

async function loadEvent(id: string) {
  const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return event;
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/events/[id]">) {
  const admin = await requireAdmin();
  if (!admin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = await loadEvent(id);
  if (!existing) {
    return Response.json({ error: "Event tidak ditemukan" }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Body harus berupa JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "Data event tidak valid" }, { status: 400 });
  }

  const { title, accessCode, retentionHours } = parsed.data;

  // Keep the slug unique if the title changed.
  let slug = existing.slug;
  if (title && title.trim() !== existing.title) {
    const base = slugify(title);
    slug = base;
    for (let attempt = 2; attempt < 100; attempt += 1) {
      const candidate = `${base}-${attempt}`;
      const [clash] = await db
        .select({ id: events.id })
        .from(events)
        .where(eq(events.slug, candidate))
        .limit(1);
      if (!clash) {
        slug = candidate;
        break;
      }
    }
  }

  await db
    .update(events)
    .set({
      ...(title ? { title: title.trim(), slug } : {}),
      ...(accessCode !== undefined
        ? { accessCode: accessCode?.trim() ? accessCode.trim().toUpperCase() : null }
        : {}),
      ...(retentionHours !== undefined ? { retentionHours } : {}),
    })
    .where(eq(events.id, id));

  // MySQL has no RETURNING, so the row is read back to report persisted state.
  const [updated] = await db.select().from(events).where(eq(events.id, id)).limit(1);

  return Response.json({
    id: updated.id,
    title: updated.title,
    slug: updated.slug,
    accessCode: updated.accessCode,
    retentionHours: updated.retentionHours,
  });
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/admin/events/[id]">,
) {
  const admin = await requireAdmin();
  if (!admin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = await loadEvent(id);
  if (!existing) {
    return Response.json({ error: "Event tidak ditemukan" }, { status: 404 });
  }

  // Cascade drops the frame rows, so their files are removed first.
  const eventFrames = await db
    .select({ imageUrl: frames.imageUrl })
    .from(frames)
    .where(eq(frames.eventId, id));

  let filesRemoved = 0;
  for (const frame of eventFrames) {
    const filename = frame.imageUrl.split("/").pop() ?? "";
    const target = resolveStoredPath(filename);
    if (!target) continue;
    try {
      await unlink(target);
      filesRemoved += 1;
    } catch {
      // The row must still go even if the file is already missing.
    }
  }

  const sessionRows = await db
    .select({ id: photoSessions.id })
    .from(photoSessions)
    .where(eq(photoSessions.eventId, id));

  await db
    .delete(events)
    .where(and(eq(events.id, id), eq(events.creatorId, admin.id)));

  return Response.json({
    ok: true,
    deletedEvent: id,
    framesRemoved: eventFrames.length,
    filesRemoved,
    detachedSessions: sessionRows.length,
  });
}
