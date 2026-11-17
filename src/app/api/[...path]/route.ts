import { app } from "@/server/app";

/**
 * Every `/api/*` request is handled by the Hono app. The old per-route files
 * were removed so this is the single entry point; Next.js still owns the
 * surrounding pages, build, and headers config.
 */
export function GET(request: Request) {
  return app.fetch(request);
}

export function POST(request: Request) {
  return app.fetch(request);
}

export function PATCH(request: Request) {
  return app.fetch(request);
}

export function DELETE(request: Request) {
  return app.fetch(request);
}
