import { serveMedia } from "@/lib/serve-media";
import { contentTypeFor, readStoredFile } from "@/lib/storage";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/files/[...path]">,
) {
  const { path: segments } = await ctx.params;
  const relative = Array.isArray(segments) ? segments.join("/") : segments;

  const bytes = await readStoredFile(relative ?? "");
  if (!bytes) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return serveMedia(
    request,
    bytes,
    contentTypeFor(relative ?? ""),
    "private, max-age=31536000, immutable",
  );
}
