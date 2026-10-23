import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { eq } from "drizzle-orm";

import { db } from "../src/db";
import { events, frames, users } from "../src/db/schema";
import { createEventCode, slugify } from "../src/lib/access-key";
import { analyzeFramePng } from "../src/lib/frame-image";
import { storeFramePng } from "../src/lib/frame-assets";
import { hashPassword } from "../src/lib/password";

async function upsertUser(email: string, password: string, role: "ADMIN" | "USER") {
  const passwordHash = await hashPassword(password);
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

  if (existing[0]) {
    await db
      .update(users)
      .set({ passwordHash, role })
      .where(eq(users.id, existing[0].id));
    return { id: existing[0].id, created: false };
  }

  const id = randomUUID();
  await db.insert(users).values({ id, email, passwordHash, role });
  return { id, created: true };
}

async function upsertEvent(title: string, creatorId: string, accessCode: string | null, retentionHours: number) {
  const slug = slugify(title);
  const existing = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.slug, slug))
    .limit(1);

  if (existing[0]) {
    await db
      .update(events)
      .set({ title, accessCode, retentionHours })
      .where(eq(events.id, existing[0].id));
    return { id: existing[0].id, slug, created: false };
  }

  const id = randomUUID();
  await db.insert(events).values({ id, title, slug, accessCode, retentionHours, creatorId });
  return { id, slug, created: true };
}

async function existingAccessCode(title: string): Promise<string | null> {
  const [row] = await db
    .select({ accessCode: events.accessCode })
    .from(events)
    .where(eq(events.slug, slugify(title)))
    .limit(1);
  return row?.accessCode ?? null;
}

type SeedFrame = {
  name: string;
  file: string;
  category: "cute" | "funny" | "horror" | "cool" | "race";
  layoutType: "STRIP_3" | "STRIP_4" | "GRID_4" | "SINGLE";
};

const SEED_FRAMES: SeedFrame[] = [
  {
    name: "Kultur",
    file: "Frame_RTS_01.png",
    category: "cool",
    layoutType: "STRIP_3",
  },
  {
    name: "Fiksi",
    file: "Frame_RTS_02.png",
    category: "cool",
    layoutType: "STRIP_3",
  },
];

async function upsertFrame(frame: SeedFrame) {
  const filePath = path.resolve(process.cwd(), frame.file);
  if (!existsSync(filePath)) {
    console.log(`frame  ${frame.name} skipped (${frame.file} tidak ada)`);
    return;
  }

  const bytes = await readFile(filePath);
  const analysis = await analyzeFramePng(bytes);
  const publicId = `frame-${slugify(frame.name)}`;
  const stored = await storeFramePng(bytes, publicId);

  const existing = await db
    .select({ id: frames.id })
    .from(frames)
    .where(eq(frames.name, frame.name))
    .limit(1);

  const values = {
    name: frame.name,
    imageUrl: stored.imageUrl,
    imagePublicId: stored.imagePublicId,
    imageWidth: analysis.width,
    imageHeight: analysis.height,
    windows: analysis.windows,
    category: frame.category,
    layoutType: frame.layoutType,
  };

  if (existing[0]) {
    // Keep the admin's event assignment across reseeds.
    await db.update(frames).set(values).where(eq(frames.id, existing[0].id));
    console.log(
      `frame  ${frame.name} updated (${stored.storage}, ${analysis.windows.length} jendela)`,
    );
    return;
  }

  await db.insert(frames).values({
    id: randomUUID(),
    ...values,
    eventId: null,
  });
  console.log(
    `frame  ${frame.name} created (${stored.storage}, ${analysis.windows.length} jendela)`,
  );
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@snapvibe.local";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "snapvibe-dev-admin";

  const admin = await upsertUser(adminEmail, adminPassword, "ADMIN");
  console.log(`admin  ${adminEmail} (${admin.created ? "created" : "updated"})`);

  // Re-seeding must not rotate the code guests already have. Use the configured
  // code when present, otherwise keep the existing one, and only generate a new
  // code for a fresh database.
  const demoCode =
    process.env.DEMO_EVENT_CODE?.trim() ||
    (await existingAccessCode("Launch Party")) ||
    createEventCode(6);
  const demo = await upsertEvent("Launch Party", admin.id, demoCode, 168);
  console.log(`event  /e/${demo.slug} (${demo.created ? "created" : "updated"}) code=${demoCode}`);

  const openEvent = await upsertEvent("Open Booth", admin.id, null, 24);
  console.log(`event  /e/${openEvent.slug} (no access code)`);

  // The two supplied RTS frames used to be hard-coded WebP overlays. They now
  // demonstrate the dynamic path: PNG -> Cloudinary -> Neon -> studio.
  for (const frame of SEED_FRAMES) {
    await upsertFrame(frame);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
