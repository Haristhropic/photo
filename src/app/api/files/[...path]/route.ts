import { contentTypeFor, readStoredFile } from "@/lib/storage";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/files/[...path]">,
) {
  const { path: segments } = await ctx.params;
  const relative = Array.isArray(segments) ? segments.join("/") : segments;

  const bytes = await readStoredFile(relative ?? "");
  if (!bytes) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentTypeFor(relative ?? ""),
      "Content-Length": String(bytes.byteLength),
      // The access key is the capability, but a guest photo should still not be
      // stored by an intermediary cache.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
