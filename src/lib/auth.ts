import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";

export const SESSION_COOKIE = "snapvibe_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

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

export function createSessionToken(userId: string): string {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export async function setSessionCookie(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Returns the authenticated admin, or null when the cookie is absent, forged, or expired. */
export async function requireAdmin() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const lastDot = token.lastIndexOf(".");
  if (lastDot < 0) return null;

  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  const expected = sign(payload);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [userId, expiresAtRaw] = payload.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (!userId || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return null;
  }

  const [user] = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || user.role !== "ADMIN") return null;
  return user;
}
