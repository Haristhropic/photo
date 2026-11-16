import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { frames } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { removeFrameAsset } from "@/lib/frame-assets";
import { isFrameCategory } from "@/lib/frames";
import { isLayoutType } from "@/lib/layouts";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    layoutType: z.string().optional(),
    category: z.string().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Tidak ada field yang diubah",
  });

async function loadFrame(id: string) {
  const [row] = await db
    .select({
      id: frames.id,
      name: frames.name,
      imageUrl: frames.imageUrl,
      imagePublicId: frames.imagePublicId,
      layoutType: frames.layoutType,
    })
    .from(frames)
    .where(eq(frames.id, id))
    .limit(1);

  return row ?? null;
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/frames/[id]">) {
  const admin = await requireAdmin();
  if (!admin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = await loadFrame(id);
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

  const { name, layoutType, category } = parsed.data;

  if (layoutType !== undefined && !isLayoutType(layoutType)) {
    return Response.json({ error: "Layout tidak dikenal" }, { status: 400 });
  }
  if (category !== undefined && !isFrameCategory(category)) {
    return Response.json({ error: "Kategori frame tidak dikenal" }, { status: 400 });
  }

  const [updated] = await db
    .update(frames)
    .set({
      ...(name ? { name: name.trim() } : {}),
      ...(layoutType ? { layoutType } : {}),
      ...(category ? { category } : {}),
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
    category: updated.category,
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
  const existing = await loadFrame(id);
  if (!existing) {
    return Response.json({ error: "Frame tidak ditemukan" }, { status: 404 });
  }

  await db.delete(frames).where(eq(frames.id, id));

  const fileRemoved = await removeFrameAsset(
    existing.imagePublicId,
    existing.imageUrl,
  );

  return Response.json({ ok: true, deletedFrame: id, fileRemoved });
}
