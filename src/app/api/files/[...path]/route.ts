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

  const rangeHeader = request.headers.get("range");
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (match) {
      const len = bytes.byteLength;
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? Math.min(parseInt(match[2], 10), len - 1) : len - 1;

      if (start >= len || start > end) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${len}` },
        });
      }

      const slice = bytes.subarray(start, end + 1);
      return new Response(new Uint8Array(slice), {
        status: 206,
        headers: {
          "Content-Type": contentTypeFor(relative ?? ""),
          "Content-Range": `bytes ${start}-${end}/${len}`,
          "Content-Length": String(slice.byteLength),
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=31536000, immutable",
        },
      });
    }
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentTypeFor(relative ?? ""),
      "Content-Length": String(bytes.byteLength),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
