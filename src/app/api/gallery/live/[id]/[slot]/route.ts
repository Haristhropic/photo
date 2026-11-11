import { eq } from "drizzle-orm";

import { db } from "@/db";
import { photoSessions } from "@/db/schema";
import { serveMedia } from "@/lib/serve-media";
import { readStoredFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Clips are written by saveMedia under a flat basename. Anything else in the
// stored value is a bad row, not a path to read.
const STORED_CLIP = /^\/api\/files\/([a-zA-Z0-9_-]+\.(?:mp4|webm))$/;
const MAX_SLOT = 7;

/**
 * Plays one Live Photo clip for a published strip.
 *
 * The gallery feed can never carry the clip URLs themselves: they are named
 * `<accessKey>-live<slot>.mp4`, and the access key is the capability that opens
 * the private result page. This route resolves a session id to its clip instead,
 * so a public visitor gets the motion without ever learning the key.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/gallery/live/[id]/[slot]">,
) {
  const { id, slot: slotParam } = await ctx.params;

  if (!SESSION_ID.test(id)) return notFound();

  const slot = Number.parseInt(slotParam, 10);
  if (!Number.isInteger(slot) || slot < 0 || slot > MAX_SLOT) return notFound();

  const [session] = await db
    .select({
      publishedAt: photoSessions.publishedAt,
      expiresAt: photoSessions.expiresAt,
      liveClips: photoSessions.liveClips,
    })
    .from(photoSessions)
    .where(eq(photoSessions.id, id))
    .limit(1);

  // Publishing is the guest's consent for a public photo, and an expired row is
  // already past its retention window. Neither may leak a clip.
  if (!session || !session.publishedAt || session.expiresAt < new Date()) {
    return notFound();
  }

  const clip = session.liveClips.find((entry) => entry.slot === slot);
  if (!clip) return notFound();

  const stored = STORED_CLIP.exec(clip.url);
  if (!stored) return notFound();

  const bytes = await readStoredFile(stored[1]);
  if (!bytes) return notFound();

  const contentType = clip.mime === "video/mp4" ? "video/mp4" : "video/webm";
  // Public feed, but clips are only kept for the session's retention window, so
  // keep a CDN copy short rather than immutable.
  return serveMedia(request, bytes, contentType, "public, max-age=3600");
}

function notFound(): Response {
  return Response.json({ error: "Not found" }, { status: 404 });
}
