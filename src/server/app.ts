import { Hono } from "hono";

import { registerAdminRoutes } from "./routes/admin";
import { registerCronRoutes } from "./routes/cron";
import { registerPublicRoutes } from "./routes/public";
import { registerSessionRoutes } from "./routes/sessions";

/**
 * The whole HTTP API, mounted once from `src/app/api/[...path]/route.ts`.
 *
 * Hono parses the request and dispatches it entirely in memory; Next.js only
 * supplies the incoming `Request`. Keeping the routes in one app means the
 * auth, rate limiting, and error handling rules live in one place instead of
 * being repeated across a dozen route files.
 */
export const app = new Hono();

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((error, c) => {
  // Never leak a stack trace or driver message to the client.
  console.error("API error:", error);
  return c.json({ error: "Terjadi kesalahan di server" }, 500);
});

registerAdminRoutes(app);
registerSessionRoutes(app);
registerPublicRoutes(app);
registerCronRoutes(app);
