import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users, type Role } from "@/db/schema";

export const SESSION_COOKIE = "snapvibe_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8;

export type SessionAdmin = { id: string; email: string; role: Role };

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new Error("SESSION_SECRET belum diset di environment");
  }
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/**
 * Ties a cookie to the current password hash, so changing an admin password
 * invalidates every session issued under the old one. Without this a stolen
 * cookie would keep working for eight hours after the password was rotated.
 */
function fingerprint(passwordHash: string): string {
  return createHmac("sha256", secret())
    .update(`session:${passwordHash}`)
    .digest("base64url");
}

export function createSessionToken(
  userId: string,
  passwordHash: string,
): string {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const id = fingerprint(passwordHash);
  const payload = `${userId}.${expiresAt}.${id}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Validates a raw cookie value. Shared by the Next.js pages (which read the
 * cookie store) and the Hono API (which reads the cookie header), so both
 * surfaces enforce exactly the same rules.
 */
export async function resolveSessionToken(
  token: string | null | undefined,
): Promise<SessionAdmin | null> {
  if (!token) return null;

  const lastDot = token.lastIndexOf(".");
  if (lastDot < 0) return null;

  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  const expected = sign(payload);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const parts = payload.split(".");
  // Three fields plus the signature. Older two-field tokens are rejected
  // outright: they predate the password binding.
  if (parts.length !== 3) return null;

  const [userId, expiresAtRaw, id] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!userId || !id || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return null;
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || user.role !== "ADMIN") return null;

  const actual = Buffer.from(id);
  const wanted = Buffer.from(fingerprint(user.passwordHash));
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) {
    return null;
  }

  return { id: user.id, email: user.email, role: user.role };
}

/** Returns the authenticated admin for a server-rendered page, or null. */
export async function requireAdmin(): Promise<SessionAdmin | null> {
  const store = await cookies();
  return resolveSessionToken(store.get(SESSION_COOKIE)?.value);
}
