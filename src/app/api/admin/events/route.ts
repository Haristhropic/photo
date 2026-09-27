import { randomUUID } from "node:crypto";

import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { events } from "@/db/schema";
import { slugify } from "@/lib/access-key";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

const bodySchema = z.object({
  title: z.string().min(1).max(160),
  accessCode: z.string().max(64).nullish(),
  retentionHours: z.number().int().min(1).max(24 * 30),
});

async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title);
  for (let attempt = 1; attempt < 100; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    const [clash] = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, candidate))
      .limit(1);
    if (!clash) return candidate;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Body harus berupa JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "Data event tidak valid" }, { status: 400 });
  }

  const title = parsed.data.title.trim();
  const slug = await uniqueSlug(title);
  const accessCode = parsed.data.accessCode?.trim()
    ? parsed.data.accessCode.trim().toUpperCase()
    : null;

  const id = randomUUID();
  await db.insert(events).values({
    id,
    title,
    slug,
    accessCode,
    retentionHours: parsed.data.retentionHours,
    creatorId: admin.id,
  });

  return Response.json(
    { id, title, slug, accessCode, retentionHours: parsed.data.retentionHours },
    { status: 201 },
  );
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      accessCode: events.accessCode,
      retentionHours: events.retentionHours,
      createdAt: events.createdAt,
    })
    .from(events)
    .where(eq(events.creatorId, admin.id))
    .orderBy(desc(events.createdAt));

  return Response.json({ events: rows });
}
