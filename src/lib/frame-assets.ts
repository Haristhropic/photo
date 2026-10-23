import {
  destroyAsset,
  isCloudinaryConfigured,
  uploadFramePng,
} from "./cloudinary";
import { deleteStoredFile, savePng } from "./storage";

export type StoredFrame = {
  imageUrl: string;
  imagePublicId: string | null;
  storage: "cloudinary" | "local";
};

/**
 * Frames normally live in Cloudinary so the Neon row only carries a durable
 * public URL and public id. A local fallback keeps the admin flow usable on a
 * dev machine without Cloudinary credentials; that path is intentionally
 * marked as `local` so the UI and delete route can treat it differently.
 */
export async function storeFramePng(
  bytes: Buffer,
  publicId: string,
): Promise<StoredFrame> {
  if (isCloudinaryConfigured()) {
    const uploaded = await uploadFramePng(bytes, publicId, { overwrite: true });
    return {
      imageUrl: uploaded.secureUrl,
      imagePublicId: uploaded.publicId,
      storage: "cloudinary",
    };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(publicId)) {
    throw new Error("Nama aset frame tidak aman");
  }

  return {
    imageUrl: await savePng(bytes, `${publicId}.png`),
    imagePublicId: null,
    storage: "local",
  };
}

/** Best-effort removal of the Cloudinary asset or local fallback file. */
export async function removeFrameAsset(
  imagePublicId: string | null,
  imageUrl: string,
): Promise<boolean> {
  if (imagePublicId) {
    return destroyAsset(imagePublicId);
  }

  const filename = imageUrl.split("/").pop() ?? "";
  return deleteStoredFile(filename);
}
