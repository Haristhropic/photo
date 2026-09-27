import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { photoSessions } from "@/db/schema";
import { contentTypeFor, readStoredFile } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/sessions/[accessKey]/download">,
) {
  const { accessKey } = await ctx.params;

  const [session] = await db
    .select()
    .from(photoSessions)
    .where(eq(photoSessions.accessKey, accessKey))
    .limit(1);

  if (!session) {
    return Response.json({ error: "Sesi tidak ditemukan" }, { status: 404 });
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    return Response.json({ error: "Sesi sudah kedaluwarsa" }, { status: 410 });
  }

  const filename = session.finalPhotoUrl.split("/").pop() ?? "";
  const bytes = await readStoredFile(filename);
  if (!bytes) {
    return Response.json({ error: "File tidak ditemukan" }, { status: 404 });
  }

  await db
    .update(photoSessions)
    .set({ downloadCount: sql`${photoSessions.downloadCount} + 1` })
    .where(eq(photoSessions.id, session.id));

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentTypeFor(filename),
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `attachment; filename="snapvibe-${accessKey}.png"`,
      "Cache-Control": "no-store",
    },
  });
}
