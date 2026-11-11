/**
 * Serves stored media bytes with the Range handling browsers need for `<video>`.
 *
 * Safari asks for a byte range before it will start a clip, so both the private
 * file proxy and the public gallery clip route have to answer 206 the same way.
 */

const RANGE_HEADER = /^bytes=(\d*)-(\d*)$/;

export function serveMedia(
  request: Request,
  bytes: Buffer,
  contentType: string,
  cacheControl: string,
): Response {
  const rangeHeader = request.headers.get("range");
  const match = rangeHeader ? RANGE_HEADER.exec(rangeHeader) : null;

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
        "Content-Type": contentType,
        "Content-Range": `bytes ${start}-${end}/${len}`,
        "Content-Length": String(slice.byteLength),
        "Accept-Ranges": "bytes",
        "Cache-Control": cacheControl,
      },
    });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
      "Accept-Ranges": "bytes",
      "Cache-Control": cacheControl,
    },
  });
}
