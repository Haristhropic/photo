/**
 * Small in-process sliding-window throttle for the unauthenticated write
 * endpoints. It is a speed bump for credential stuffing and upload flooding,
 * not a distributed rate limiter: each serverless instance keeps its own map,
 * and a cold start forgets everything. Platform-level limiting (or a shared
 * store) is still required for a hard guarantee.
 */

const MAX_BUCKETS = 5_000;

const buckets = new Map<string, number[]>();

export type RateLimitResult = {
  allowed: boolean;
  /** Whole seconds until the oldest hit leaves the window. */
  retryAfter: number;
};

function prune(now: number, windowMs: number): void {
  if (buckets.size < MAX_BUCKETS) return;

  const cutoff = now - windowMs;
  for (const [key, hits] of buckets) {
    const last = hits[hits.length - 1];
    if (last === undefined || last <= cutoff) buckets.delete(key);
  }

  // If spoofed client identities still fill the map, drop the oldest buckets
  // instead of letting memory grow without bound. Rotating identities already
  // defeats the limiter; bounded memory is the property worth keeping.
  while (buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next();
    if (oldest.done) break;
    buckets.delete(oldest.value);
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  let hits = buckets.get(key);
  if (!hits) {
    hits = [];
    buckets.set(key, hits);
  } else if (hits.length > 0 && hits[0] <= cutoff) {
    // Hits are appended in time order, so the expired ones are a prefix.
    const firstLive = hits.findIndex((at) => at > cutoff);
    if (firstLive === -1) hits.length = 0;
    else if (firstLive > 0) hits.splice(0, firstLive);
  }

  if (hits.length >= limit) {
    const oldest = hits[0] ?? now;
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  hits.push(now);
  prune(now, windowMs);
  return { allowed: true, retryAfter: 0 };
}

/**
 * Best-effort client identity. Vercel sets `x-forwarded-for` itself; the value
 * is spoofable on hosts that merely forward it, which is why the endpoints this
 * guards are also bounded by size limits and the residual risk is documented.
 */
export function clientKey(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  // Local development and e2e run without a proxy. Keep one shared bucket so
  // the limiter is still exercised, but only outside production.
  return process.env.NODE_ENV === "production" ? null : "local";
}

export function tooManyRequests(retryAfter: number): Response {
  return Response.json(
    { error: "Terlalu banyak percobaan. Coba lagi sebentar lagi." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "Cache-Control": "no-store",
      },
    },
  );
}
