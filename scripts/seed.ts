import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "../src/db";
import { events, users } from "../src/db/schema";
import { createEventCode, slugify } from "../src/lib/access-key";
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
  const existing = await db.select({ id: events.id }).from(events).where(eq(events.slug, slug)).limit(1);

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

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@snapvibe.local";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "snapvibe-dev-admin";

  const admin = await upsertUser(adminEmail, adminPassword, "ADMIN");
  console.log(`admin  ${adminEmail} (${admin.created ? "created" : "updated"})`);

  const demoCode = process.env.DEMO_EVENT_CODE ?? createEventCode(6);
  const demo = await upsertEvent("Launch Party", admin.id, demoCode, 168);
  console.log(`event  /e/${demo.slug} (${demo.created ? "created" : "updated"}) code=${demoCode}`);

  const openEvent = await upsertEvent("Open Booth", admin.id, null, 24);
  console.log(`event  /e/${openEvent.slug} (no access code)`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
