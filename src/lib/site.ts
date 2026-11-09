import { headers } from "next/headers";

const FALLBACK_BASE_URL = "http://localhost:3000";

function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first ? first : null;
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function isLocalHost(host: string): boolean {
  const hostname = host.toLowerCase().replace(/:\d+$/, "");
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    hostname.endsWith(".local")
  );
}

/**
 * Origin this request was served from. A QR code is scanned by a phone on the
 * same network, so it has to encode the host the guest already reached; a
 * configured or deployment URL can go stale (an old alias, a preview domain)
 * and send the phone to a dead page. `NEXT_PUBLIC_BASE_URL` stays as a
 * fallback for renders without a request host.
 */
export async function requestOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host =
    firstHeaderValue(requestHeaders.get("x-forwarded-host")) ??
    firstHeaderValue(requestHeaders.get("host"));

  if (host) {
    const proto =
      firstHeaderValue(requestHeaders.get("x-forwarded-proto")) ??
      (isLocalHost(host) ? "http" : "https");
    return `${proto}://${host}`;
  }

  const configured = process.env.NEXT_PUBLIC_BASE_URL;
  if (configured) return stripTrailingSlashes(configured);

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionHost) return `https://${stripTrailingSlashes(productionHost)}`;

  return FALLBACK_BASE_URL;
}

export async function absoluteUrl(pathname: string): Promise<string> {
  return `${await requestOrigin()}${
    pathname.startsWith("/") ? pathname : `/${pathname}`
  }`;
}
