import { db } from "@/db";
import { photoSessions } from "@/db/schema";
import { LAYOUTS } from "@/lib/layouts";
import { saveMedia } from "@/lib/storage";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SAFE_ACCESS_KEY = /^[a-z0-9]{20}$/;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB per clip
const MAX_TOTAL_SIZE = 8 * 1024 * 1024; // 8MB total

type RouteContext = { params: Promise<{ accessKey: string }> };

function isMp4(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
}

function isWebm(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
}

export async function POST(request: Request, ctx: RouteContext) {
  const { accessKey } = await ctx.params;
  if (!SAFE_ACCESS_KEY.test(accessKey)) {
    return NextResponse.json({ error: "Invalid access key" }, { status: 400 });
  }

  const [session] = await db
    .select({ id: photoSessions.id, layoutType: photoSessions.layoutType, expiresAt: photoSessions.expiresAt })
    .from(photoSessions)
    .where(eq(photoSessions.accessKey, accessKey))
    .limit(1);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.expiresAt < new Date()) {
    return NextResponse.json({ error: "Session expired" }, { status: 410 });
  }

  const layout = LAYOUTS[session.layoutType];
  if (!layout) {
    return NextResponse.json({ error: "Invalid layout" }, { status: 400 });
  }

  const form = await request.formData();
  const entries: { slot: number; mime: string; durationMs: number; url: string }[] = [];
  let totalSize = 0;

  for (let slot = 0; slot < layout.shotCount; slot++) {
    const file = form.get(`slot-${slot}`) as File | null;
    if (!file) continue;

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `Clip ${slot} exceeds 2MB` }, { status: 413 });
    }

    totalSize += bytes.length;
    if (totalSize > MAX_TOTAL_SIZE) {
      return NextResponse.json({ error: "Total clips exceed 8MB" }, { status: 413 });
    }

    const isValidMp4 = isMp4(bytes);
    const isValidWebm = isWebm(bytes);
    if (!isValidMp4 && !isValidWebm) {
      return NextResponse.json({ error: `Clip ${slot} is not a valid video` }, { status: 400 });
    }

    const ext = isValidMp4 ? "mp4" : "webm";
    const mime = isValidMp4 ? "video/mp4" : "video/webm";
    const filename = `${accessKey}-live${slot}.${ext}`;

    const stored = await saveMedia(bytes, filename, mime);
    entries.push({ slot, mime, durationMs: 2000, url: stored.url });
  }

  if (entries.length === 0) {
    return NextResponse.json({ error: "No clips provided" }, { status: 400 });
  }

  await db
    .update(photoSessions)
    .set({ liveClips: entries })
    .where(eq(photoSessions.id, session.id));

  return new NextResponse(null, { status: 204 });
}
