import { unlink } from "node:fs/promises";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { events, frames } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { isLayoutType } from "@/lib/layouts";
import { resolveStoredPath } from "@/lib/storage";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    layoutType: z.string().optional(),
    eventId: z.string().uuid().nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Tidak ada field yang diubah",
  });

async function loadOwnedFrame(id: string, adminId: string) {
  const [row] = await db
    .select({
      id: frames.id,
      name: frames.name,
      imageUrl: frames.imageUrl,
      layoutType: frames.layoutType,
      eventId: frames.eventId,
      ownerId: events.creatorId,
    })
    .from(frames)
    .leftJoin(events, eq(frames.eventId, events.id))
    .where(eq(frames.id, id))
    .limit(1);

  if (!row) return null;
  // Unassigned frames are shared; assigned frames belong to their creator.
  if (row.eventId !== null && row.ownerId !== adminId) return null;
  return row;
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/frames/[id]">) {
  const admin = await requireAdmin();
  if (!admin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = await loadOwnedFrame(id, admin.id);
  if (!existing) {
    return Response.json({ error: "Frame tidak ditemukan" }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Body harus berupa JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "Data frame tidak valid" }, { status: 400 });
  }

  const { name, layoutType, eventId } = parsed.data;

  if (layoutType !== undefined && !isLayoutType(layoutType)) {
    return Response.json({ error: "Layout tidak dikenal" }, { status: 400 });
  }

  if (eventId) {
    const [target] = await db
      .select({ id: events.id, ownerId: events.creatorId })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.creatorId, admin.id)))
      .limit(1);
    if (!target) {
      return Response.json({ error: "Event tidak ditemukan" }, { status: 404 });
    }
  }

  const [updated] = await db
    .update(frames)
    .set({
      ...(name ? { name: name.trim() } : {}),
      ...(layoutType ? { layoutType } : {}),
      ...(eventId !== undefined ? { eventId: eventId ?? null } : {}),
    })
    .where(eq(frames.id, id))
    .returning();

  if (!updated) {
    return Response.json({ error: "Frame tidak ditemukan" }, { status: 404 });
  }

  return Response.json({
    id: updated.id,
    name: updated.name,
    imageUrl: updated.imageUrl,
    layoutType: updated.layoutType,
    eventId: updated.eventId,
  });
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/admin/frames/[id]">,
) {
  const admin = await requireAdmin();
  if (!admin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = await loadOwnedFrame(id, admin.id);
  if (!existing) {
    return Response.json({ error: "Frame tidak ditemukan" }, { status: 404 });
  }

  await db.delete(frames).where(eq(frames.id, id));

  const filename = existing.imageUrl.split("/").pop() ?? "";
  const target = resolveStoredPath(filename);
  let fileRemoved = false;
  if (target) {
    try {
      await unlink(target);
      fileRemoved = true;
    } catch {
      // The row is already gone; a missing file is not an error here.
    }
  }

  return Response.json({ ok: true, deletedFrame: id, fileRemoved });
}
