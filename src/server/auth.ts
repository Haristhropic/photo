import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";

import {
  createSessionToken,
  resolveSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  type SessionAdmin,
} from "@/lib/auth";

const secure = process.env.NODE_ENV === "production";

/**
 * Hono-side session helpers. Cookie parsing/serialisation goes through Hono's
 * cookie helper instead of `next/headers`, so the API layer does not depend on
 * the Next.js request context.
 */
export async function currentAdmin(c: Context): Promise<SessionAdmin | null> {
  return resolveSessionToken(getCookie(c, SESSION_COOKIE));
}

export function startAdminSession(
  c: Context,
  userId: string,
  passwordHash: string,
): void {
  setCookie(c, SESSION_COOKIE, createSessionToken(userId, passwordHash), {
    httpOnly: true,
    sameSite: "Lax",
    secure,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function endAdminSession(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure });
}

export function unauthorized(c: Context) {
  return c.json({ error: "Unauthorized" }, 401);
}
