// Cloudinary is called only from the server. CLOUDINARY_URL carries the API
// secret, so it must never be imported by a client component or echoed into a
// response body; parse it lazily and keep the parsed parts module-private.

const CLOUDINARY_URL_PATTERN =
  /^cloudinary:\/\/(\d+):([^@]+)@([a-zA-Z0-9_-]+)$/;

export const GALLERY_FOLDER =
  process.env.CLOUDINARY_FOLDER?.trim() || "photo";
export const FRAME_FOLDER =
  process.env.CLOUDINARY_FRAME_FOLDER?.trim() || "snapvibe/frames";

type CloudinaryConfig = { apiKey: string; apiSecret: string; cloud: string };

let cached: CloudinaryConfig | null = null;

function config(): CloudinaryConfig | null {
  if (cached) return cached;
  const raw = process.env.CLOUDINARY_URL?.trim();
  if (!raw) return null;
  const match = CLOUDINARY_URL_PATTERN.exec(raw);
  if (!match) {
    throw new Error(
      "CLOUDINARY_URL must look like cloudinary://KEY:SECRET@CLOUD_NAME",
    );
  }
  const [, apiKey, apiSecret, cloud] = match;
  cached = { apiKey, apiSecret, cloud };
  return cached;
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(process.env.CLOUDINARY_URL?.trim());
}

export type CloudinaryUpload = {
  publicId: string;
  secureUrl: string;
  width: number;
  height: number;
  bytes: number;
};

export class CloudinaryError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CloudinaryError";
    this.status = status;
  }
}

async function uploadPng(
  bytes: Buffer,
  publicId: string,
  folder: string,
  overwrite: boolean,
): Promise<CloudinaryUpload> {
  const cfg = config();
  if (!cfg) {
    throw new CloudinaryError("CLOUDINARY_URL belum diatur", 503);
  }

  const form = new FormData();
  form.set(
    "file",
    new Blob([new Uint8Array(bytes)], { type: "image/png" }),
    `${publicId}.png`,
  );
  form.set("folder", folder);
  form.set("public_id", publicId);
  form.set("overwrite", overwrite ? "true" : "false");

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cfg.cloud}/image/upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${cfg.apiKey}:${cfg.apiSecret}`,
        ).toString("base64")}`,
      },
      body: form,
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new CloudinaryError(
      `Cloudinary menolak upload (${response.status}): ${detail}`,
      502,
    );
  }

  const payload = (await response.json()) as {
    public_id?: unknown;
    secure_url?: unknown;
    width?: unknown;
    height?: unknown;
    bytes?: unknown;
  };

  if (
    typeof payload.public_id !== "string" ||
    typeof payload.secure_url !== "string"
  ) {
    throw new CloudinaryError(
      "Respons Cloudinary tidak memuat public_id/secure_url",
      502,
    );
  }

  return {
    publicId: payload.public_id,
    secureUrl: payload.secure_url,
    width: typeof payload.width === "number" ? payload.width : 0,
    height: typeof payload.height === "number" ? payload.height : 0,
    bytes: typeof payload.bytes === "number" ? payload.bytes : bytes.byteLength,
  };
}

/**
 * Uploads a rendered strip into the gallery folder. The caller owns the
 * `publicId` so a retry cannot silently create a second asset.
 */
export async function uploadStripPng(
  bytes: Buffer,
  publicId: string,
): Promise<CloudinaryUpload> {
  return uploadPng(bytes, publicId, GALLERY_FOLDER, false);
}

/**
 * Uploads an admin-managed frame overlay. Frames keep their transparency, so
 * the original PNG is uploaded as-is. The deterministic public id lets the
 * seed script replace the shipped RTS artwork without creating duplicates.
 */
export async function uploadFramePng(
  bytes: Buffer,
  publicId: string,
  options: { overwrite?: boolean } = {},
): Promise<CloudinaryUpload> {
  return uploadPng(
    bytes,
    publicId,
    FRAME_FOLDER,
    options.overwrite ?? false,
  );
}

/** Removes a published asset. A missing asset is already in the desired state. */
export async function destroyAsset(publicId: string): Promise<boolean> {
  const cfg = config();
  if (!cfg) return false;

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cfg.cloud}/image/destroy`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(
          `${cfg.apiKey}:${cfg.apiSecret}`,
        ).toString("base64")}`,
      },
      body: JSON.stringify({ public_id: publicId, invalidate: true }),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) return response.status === 404;

  const payload = (await response.json().catch(() => null)) as {
    result?: unknown;
  } | null;

  // Cloudinary reports a previously destroyed asset with HTTP 200 and
  // result=not found, which is still the state we want.
  return (
    !payload ||
    payload.result === undefined ||
    payload.result === "ok" ||
    payload.result === "not found"
  );
}
