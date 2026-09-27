export function baseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function absoluteUrl(pathname: string): string {
  return `${baseUrl()}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}
