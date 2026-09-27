import { timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { events } from "@/db/schema";

export const runtime = "nodejs";

const bodySchema = z.object({
  code: z.string().max(64).optional().default(""),
});

function codesMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected.toUpperCase(), "utf8");
  const b = Buffer.from(provided.toUpperCase(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/events/[slug]/verify">,
) {
  const { slug } = await ctx.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Body harus berupa JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "Kode tidak valid" }, { status: 400 });
  }

  const [event] = await db
    .select({
      id: events.id,
      accessCode: events.accessCode,
      retentionHours: events.retentionHours,
    })
    .from(events)
    .where(eq(events.slug, slug))
    .limit(1);

  if (!event) {
    return Response.json({ error: "Event tidak ditemukan" }, { status: 404 });
  }

  if (!event.accessCode) {
    return Response.json({ ok: true, eventId: event.id });
  }

  if (!codesMatch(event.accessCode, parsed.data.code)) {
    return Response.json({ error: "Kode event salah" }, { status: 401 });
  }

  return Response.json({
    ok: true,
    eventId: event.id,
    retentionHours: event.retentionHours,
  });
}
