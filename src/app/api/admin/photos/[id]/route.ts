import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { photoSessions } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { destroyAsset, isCloudinaryConfigured } from "@/lib/cloudinary";
import { deleteStoredFile } from "@/lib/storage";

export const runtime = "nodejs";

const idSchema = z.string().uuid();
const patchSchema = z.object({ published: z.literal(false) });

async function loadPhoto(id: string) {
  const [row] = await db
    .select({
      id: photoSessions.id,
      finalPhotoUrl: photoSessions.finalPhotoUrl,
      cloudinaryPublicId: photoSessions.cloudinaryPublicId,
      publishedAt: photoSessions.publishedAt,
    })
    .from(photoSessions)
    .where(eq(photoSessions.id, id))
    .limit(1);
  return row;
}

/**
 * Removes a photo from the public gallery without touching the private copy
 * the guest can still reach from their result page.
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const validId = idSchema.safeParse(id);
  if (!validId.success) {
    return Response.json({ error: "Foto tidak ditemukan" }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Body harus berupa JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "Aksi foto tidak valid" }, { status: 400 });
  }

  const existing = await loadPhoto(validId.data);
  if (!existing) {
    return Response.json({ error: "Foto tidak ditemukan" }, { status: 404 });
  }

  if (existing.publishedAt === null) {
    return Response.json({ ok: true, id: existing.id, published: false });
  }

  // The Cloudinary copy exists only for the public gallery. Remove it as soon
  // as the photo is hidden so the admin actually reclaims storage; the guest's
  // private /api/files copy is untouched. If Cloudinary is unavailable the
  // row still leaves the gallery, and the retention job retries the asset later.
  let storageCleared = false;
  if (existing.cloudinaryPublicId && isCloudinaryConfigured()) {
    try {
      storageCleared = await destroyAsset(existing.cloudinaryPublicId);
    } catch {
      storageCleared = false;
    }
  }

  await db
    .update(photoSessions)
    .set({
      publishedAt: null,
      ...(storageCleared
        ? { cloudinaryPublicId: null, cloudinaryUrl: null }
        : {}),
    })
    .where(eq(photoSessions.id, existing.id));

  return Response.json({
    ok: true,
    id: existing.id,
    published: false,
    storageCleared,
  });
}

/**
 * Permanently removes the gallery asset and the private copy. The Cloudinary
 * destroy must succeed before the row is dropped, otherwise the public asset
 * would become orphaned and impossible to find from the admin UI.
 */
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const validId = idSchema.safeParse(id);
  if (!validId.success) {
    return Response.json({ error: "Foto tidak ditemukan" }, { status: 404 });
  }

  const existing = await loadPhoto(validId.data);
  if (!existing) {
    return Response.json({ error: "Foto tidak ditemukan" }, { status: 404 });
  }

  if (existing.cloudinaryPublicId) {
    if (!isCloudinaryConfigured()) {
      return Response.json(
        { error: "Cloudinary belum dikonfigurasi; aset publik tidak bisa dihapus" },
        { status: 503 },
      );
    }

    try {
      const removed = await destroyAsset(existing.cloudinaryPublicId);
      if (!removed) {
        return Response.json(
          { error: "Cloudinary menolak menghapus aset; coba lagi" },
          { status: 502 },
        );
      }
    } catch {
      return Response.json(
        { error: "Tidak bisa menghubungi Cloudinary; coba lagi" },
        { status: 502 },
      );
    }
  }

  const filename = existing.finalPhotoUrl.split("/").pop() ?? "";
  // The row still has to go when the private copy was already removed.
  await deleteStoredFile(filename);

  await db.delete(photoSessions).where(eq(photoSessions.id, existing.id));

  return Response.json({ ok: true, id: existing.id });
}
