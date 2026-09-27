import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { users } from "@/db/schema";
import { setSessionCookie } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Body harus berupa JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "Email atau password salah" }, { status: 401 });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, parsed.data.email.toLowerCase()))
    .limit(1);

  const valid = user
    ? await verifyPassword(parsed.data.password, user.passwordHash)
    : false;

  if (!user || !valid || user.role !== "ADMIN") {
    return Response.json({ error: "Email atau password salah" }, { status: 401 });
  }

  await setSessionCookie(user.id);
  return Response.json({ ok: true, email: user.email });
}
