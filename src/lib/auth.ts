import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";

import { db } from "@/db";
import { users, type Role } from "@/db/schema";

export const SESSION_COOKIE = "snapvibe_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8;

// The token is a signed JWT (HS256) so it carries its own expiry and identity
// instead of relying on a bespoke serialisation. The algorithm is pinned on
// verification: without that, a tampered header could downgrade to `none`.
const JWT_ALG = "HS256";
const JWT_ISSUER = "snapvibe";
const JWT_AUDIENCE = "snapvibe-admin";

export type SessionAdmin = { id: string; email: string; role: Role };

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new Error("SESSION_SECRET belum diset di environment");
  }
  return new TextEncoder().encode(value);
}

/**
 * Ties a token to the current password hash, so changing an admin password
 * invalidates every JWT issued under the old one. Without this a stolen cookie
 * would keep working for eight hours after the password was rotated.
 */
function fingerprint(passwordHash: string): string {
  return createHmac("sha256", secret())
    .update(`session:${passwordHash}`)
    .digest("base64url");
}

export async function createSessionToken(
  admin: SessionAdmin,
  passwordHash: string,
): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);

  return new SignJWT({
    email: admin.email,
    role: admin.role,
    // Custom claim, not part of RFC 7519. It is what binds the JWT to the
    // password hash; the payload is signed, so a client cannot change it.
    pwd: fingerprint(passwordHash),
  })
    .setProtectedHeader({ alg: JWT_ALG, typ: "JWT" })
    .setSubject(admin.id)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_TTL_SECONDS)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .sign(secret());
}

/**
 * Validates a raw cookie value: signature, issuer, audience and expiry first,
 * then the claims against the database. Shared by the Next.js pages (which read
 * the cookie store) and the Hono API (which reads the cookie header), so both
 * surfaces enforce exactly the same rules.
 */
export async function resolveSessionToken(
  token: string | null | undefined,
): Promise<SessionAdmin | null> {
  if (!token) return null;

  let userId: unknown;
  let bound: unknown;

  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: [JWT_ALG],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      // Tolerate a few seconds of clock skew between instances.
      clockTolerance: 5,
    });
    userId = payload.sub;
    bound = payload.pwd;
  } catch {
    // Bad signature, wrong issuer/audience, expired, malformed: all the same
    // answer to the caller, and never a thrown error inside a page render.
    return null;
  }

  if (typeof userId !== "string" || !userId) return null;
  if (typeof bound !== "string" || !bound) return null;

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

  // The role is read from the database rather than trusted from the claim, so a
  // demoted account loses API access even while its token is still valid.
  if (!user || user.role !== "ADMIN") return null;

  const actual = Buffer.from(bound);
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
