import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { eq } from "drizzle-orm";

import { db } from "../src/db";
import { frames, users } from "../src/db/schema";
import { slugify } from "../src/lib/access-key";
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

type SeedFrame = {
  name: string;
  file: string;
  category: "cute" | "funny" | "horror" | "cool" | "race";
  layoutType: "STRIP_2" | "STRIP_3" | "STRIP_4" | "GRID_4" | "SINGLE";
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
    await db.update(frames).set(values).where(eq(frames.id, existing[0].id));
    console.log(
      `frame  ${frame.name} updated (${stored.storage}, ${analysis.windows.length} jendela)`,
    );
    return;
  }

  await db.insert(frames).values({
    id: randomUUID(),
    ...values,
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
