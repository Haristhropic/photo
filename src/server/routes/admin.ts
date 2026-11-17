import { randomUUID } from "node:crypto";

import { desc, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";

import { db } from "@/db";
import { frames, photoSessions, users } from "@/db/schema";
import { destroyAsset, isCloudinaryConfigured } from "@/lib/cloudinary";
import { analyzeFramePng } from "@/lib/frame-image";
import { removeFrameAsset, storeFramePng } from "@/lib/frame-assets";
import { isFrameCategory } from "@/lib/frames";
import { isLayoutType } from "@/lib/layouts";
import { verifyPassword } from "@/lib/password";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { deleteStoredFile } from "@/lib/storage";
import {
  currentAdmin,
  endAdminSession,
  startAdminSession,
  unauthorized,
} from "@/server/auth";

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

// A fixed, unreachable hash. Verifying against it when the email does not
// exist makes a missing account take the same scrypt time as a wrong password,
// so response latency cannot be used to enumerate admin emails.
const DUMMY_PASSWORD_HASH =
  "scrypt:ad3c91405f2fb1820b5de00def28758a:fec92355bf947bec0dc3adeb39aa95d78c81c8e19fab17ee8c6b9a9fd86ea7771e3d0c75baf602ff87ea90604aefb41789227ea48b52d92e324737df7a8417d4";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const frameFields = z.object({
  name: z.string().trim().min(1).max(120),
  layoutType: z.string(),
  category: z.string().optional(),
});

const framePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    layoutType: z.string().optional(),
    category: z.string().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Tidak ada field yang diubah",
  });

const photoIdSchema = z.string().uuid();
const photoPatchSchema = z.object({ published: z.literal(false) });

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

async function loadPhoto(id: string) {
  const [row] = await db
    .select({
      id: photoSessions.id,
      finalPhotoUrl: photoSessions.finalPhotoUrl,
      cloudinaryPublicId: photoSessions.cloudinaryPublicId,
      publishedAt: photoSessions.publishedAt,
      liveClips: photoSessions.liveClips,
    })
    .from(photoSessions)
    .where(eq(photoSessions.id, id))
    .limit(1);
  return row;
}

export function registerAdminRoutes(app: Hono): void {
  app.post("/api/admin/login", async (c) => {
    // Throttle before reading the body so a flood is cheap to reject.
    const key = clientKey(c.req.raw);
    if (key) {
      const limited = rateLimit(`login:${key}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
      if (!limited.allowed) return tooManyRequests(limited.retryAfter);
    }

    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return c.json({ error: "Body harus berupa JSON" }, 400);
    }

    const parsed = loginSchema.safeParse(payload);
    if (!parsed.success) {
      return c.json({ error: "Email atau password salah" }, 401);
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, parsed.data.email.toLowerCase()))
      .limit(1);

    const valid = await verifyPassword(
      parsed.data.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !valid || user.role !== "ADMIN") {
      return c.json({ error: "Email atau password salah" }, 401);
    }

    startAdminSession(c, user.id, user.passwordHash);
    return c.json({ ok: true, email: user.email });
  });

  app.post("/api/admin/logout", (c) => {
    endAdminSession(c);
    return c.json({ ok: true });
  });

  app.get("/api/admin/frames", async (c) => {
    if (!(await currentAdmin(c))) return unauthorized(c);

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
        createdAt: frames.createdAt,
      })
      .from(frames)
      .orderBy(desc(frames.createdAt));

    return c.json({
      frames: rows.map((row) => ({
        ...row,
        storage: row.imagePublicId ? "cloudinary" : "local",
        windowCount: row.windows.length,
      })),
    });
  });

  app.post("/api/admin/frames", async (c) => {
    if (!(await currentAdmin(c))) return unauthorized(c);

    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return c.json({ error: "Body harus berupa form data" }, 400);
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return c.json({ error: "File PNG wajib diunggah" }, 400);
    }
    if (file.size > MAX_FRAME_BYTES) {
      return c.json({ error: "File terlalu besar" }, 413);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (!bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
      return c.json({ error: "File bukan PNG yang valid" }, 415);
    }

    const parsed = frameFields.safeParse({
      name: form.get("name"),
      layoutType: form.get("layoutType"),
      category: form.get("category") || undefined,
    });
    if (!parsed.success) {
      return c.json({ error: "Data frame tidak valid" }, 400);
    }
    if (!isLayoutType(parsed.data.layoutType)) {
      return c.json({ error: "Layout tidak dikenal" }, 400);
    }
    const category = parsed.data.category ?? "cool";
    if (!isFrameCategory(category)) {
      return c.json({ error: "Kategori frame tidak dikenal" }, 400);
    }

    let analysis;
    try {
      analysis = await analyzeFramePng(bytes);
    } catch {
      return c.json(
        { error: "PNG tidak bisa dibaca atau terlalu besar" },
        400,
      );
    }
    if (analysis.width < 120 || analysis.height < 120) {
      return c.json({ error: "Ukuran frame terlalu kecil" }, 400);
    }

    const id = randomUUID();
    let stored;
    try {
      stored = await storeFramePng(bytes, `frame-${id}`);
    } catch (error) {
      console.error("frame upload failed:", error);
      return c.json({ error: "Gagal mengunggah frame ke Cloudinary" }, 502);
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
    });

    return c.json(
      {
        id,
        imageUrl: stored.imageUrl,
        name: parsed.data.name.trim(),
        storage: stored.storage,
        width: analysis.width,
        height: analysis.height,
        windowCount: analysis.windows.length,
      },
      201,
    );
  });

  app.patch("/api/admin/frames/:id", async (c) => {
    if (!(await currentAdmin(c))) return unauthorized(c);

    const id = c.req.param("id");
    const existing = await loadFrame(id);
    if (!existing) {
      return c.json({ error: "Frame tidak ditemukan" }, 404);
    }

    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return c.json({ error: "Body harus berupa JSON" }, 400);
    }

    const parsed = framePatchSchema.safeParse(payload);
    if (!parsed.success) {
      return c.json({ error: "Data frame tidak valid" }, 400);
    }

    const { name, layoutType, category } = parsed.data;

    if (layoutType !== undefined && !isLayoutType(layoutType)) {
      return c.json({ error: "Layout tidak dikenal" }, 400);
    }
    if (category !== undefined && !isFrameCategory(category)) {
      return c.json({ error: "Kategori frame tidak dikenal" }, 400);
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
      return c.json({ error: "Frame tidak ditemukan" }, 404);
    }

    return c.json({
      id: updated.id,
      name: updated.name,
      imageUrl: updated.imageUrl,
      layoutType: updated.layoutType,
      category: updated.category,
    });
  });

  app.delete("/api/admin/frames/:id", async (c) => {
    if (!(await currentAdmin(c))) return unauthorized(c);

    const id = c.req.param("id");
    const existing = await loadFrame(id);
    if (!existing) {
      return c.json({ error: "Frame tidak ditemukan" }, 404);
    }

    await db.delete(frames).where(eq(frames.id, id));

    const fileRemoved = await removeFrameAsset(
      existing.imagePublicId,
      existing.imageUrl,
    );

    return c.json({ ok: true, deletedFrame: id, fileRemoved });
  });

  app.patch("/api/admin/photos/:id", async (c) => {
    if (!(await currentAdmin(c))) return unauthorized(c);

    const validId = photoIdSchema.safeParse(c.req.param("id"));
    if (!validId.success) {
      return c.json({ error: "Foto tidak ditemukan" }, 404);
    }

    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return c.json({ error: "Body harus berupa JSON" }, 400);
    }

    const parsed = photoPatchSchema.safeParse(payload);
    if (!parsed.success) {
      return c.json({ error: "Aksi foto tidak valid" }, 400);
    }

    const existing = await loadPhoto(validId.data);
    if (!existing) {
      return c.json({ error: "Foto tidak ditemukan" }, 404);
    }

    if (existing.publishedAt === null) {
      return c.json({ ok: true, id: existing.id, published: false });
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

    return c.json({
      ok: true,
      id: existing.id,
      published: false,
      storageCleared,
    });
  });

  app.delete("/api/admin/photos/:id", async (c) => {
    if (!(await currentAdmin(c))) return unauthorized(c);

    const validId = photoIdSchema.safeParse(c.req.param("id"));
    if (!validId.success) {
      return c.json({ error: "Foto tidak ditemukan" }, 404);
    }

    const existing = await loadPhoto(validId.data);
    if (!existing) {
      return c.json({ error: "Foto tidak ditemukan" }, 404);
    }

    if (existing.cloudinaryPublicId) {
      if (!isCloudinaryConfigured()) {
        return c.json(
          {
            error:
              "Cloudinary belum dikonfigurasi; aset publik tidak bisa dihapus",
          },
          503,
        );
      }

      try {
        const removed = await destroyAsset(existing.cloudinaryPublicId);
        if (!removed) {
          return c.json(
            { error: "Cloudinary menolak menghapus aset; coba lagi" },
            502,
          );
        }
      } catch {
        return c.json(
          { error: "Tidak bisa menghubungi Cloudinary; coba lagi" },
          502,
        );
      }
    }

    const filename = existing.finalPhotoUrl.split("/").pop() ?? "";
    await deleteStoredFile(filename);

    if (existing.liveClips && Array.isArray(existing.liveClips)) {
      for (const clip of existing.liveClips) {
        if (clip?.url) {
          const clipFilename = clip.url.split("/").pop() ?? "";
          void deleteStoredFile(clipFilename);
        }
      }
    }

    await db.delete(photoSessions).where(eq(photoSessions.id, existing.id));

    return c.json({ ok: true, id: existing.id });
  });
}
