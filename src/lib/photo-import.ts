/**
 * Client-side import for photos the guest already has.
 *
 * The original file never leaves the device. We decode it, honour EXIF
 * orientation (through `createImageBitmap` where available), downscale it to a
 * size the 900px strip can actually show, and re-encode it as JPEG. That strips
 * GPS and camera metadata as a side effect and keeps the draft small enough for
 * sessionStorage.
 */

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
export const MAX_IMPORT_EDGE = 1440;
export const MAX_IMPORT_PIXELS = 60_000_000;
export const IMPORT_ACCEPT = "image/*,.heic,.heif";

const JPEG_QUALITY = 0.84;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
]);

export type ImportedPhoto = {
  dataUrl: string;
  width: number;
  height: number;
};

export type PhotoImportErrorKind =
  | "type"
  | "size"
  | "empty"
  | "decode"
  | "memory"
  | "encode";

export class PhotoImportError extends Error {
  readonly kind: PhotoImportErrorKind;

  constructor(kind: PhotoImportErrorKind, message: string) {
    super(message);
    this.name = "PhotoImportError";
    this.kind = kind;
  }
}

function allowedFile(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type) return ALLOWED_TYPES.has(type);
  // Some pickers report an empty MIME type for HEIC/HEIF. Let the decoder make
  // the final call rather than rejecting a valid camera-roll file by name.
  return /\.(jpe?g|png|webp|avif|heic|heif)$/i.test(file.name);
}

type DecodedSource = {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  dispose: () => void;
};

async function decodeWithBitmap(file: File): Promise<DecodedSource | null> {
  if (typeof createImageBitmap !== "function") return null;

  try {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Older implementations do not understand the options bag.
      bitmap = await createImageBitmap(file);
    }
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, width, height) => {
        ctx.drawImage(bitmap, 0, 0, width, height);
      },
      dispose: () => bitmap.close(),
    };
  } catch {
    return null;
  }
}

async function decodeWithImage(file: File): Promise<DecodedSource> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = url;

  try {
    if (typeof image.decode === "function") {
      await image.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("decode failed"));
      });
    }
  } catch {
    URL.revokeObjectURL(url);
    throw new PhotoImportError(
      "decode",
      "Foto ini tidak bisa dibaca di browser ini. Kalau ini foto iPhone (HEIC), coba ekspor sebagai JPEG atau pilih dari galeri lagi.",
    );
  }

  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    draw: (ctx, width, height) => {
      ctx.drawImage(image, 0, 0, width, height);
    },
    dispose: () => URL.revokeObjectURL(url),
  };
}

async function decode(file: File): Promise<DecodedSource> {
  const bitmap = await decodeWithBitmap(file);
  if (bitmap) return bitmap;
  return decodeWithImage(file);
}

export async function importPhoto(file: File): Promise<ImportedPhoto> {
  if (file.size === 0) {
    throw new PhotoImportError("empty", "File fotonya kosong.");
  }
  if (!allowedFile(file)) {
    throw new PhotoImportError(
      "type",
      "Format foto ini belum didukung. Coba JPEG, PNG, atau WebP.",
    );
  }
  if (file.size > MAX_IMPORT_BYTES) {
    throw new PhotoImportError(
      "size",
      "Fotonya terlalu besar. Pilih foto di bawah 25 MB.",
    );
  }

  const source = await decode(file);
  try {
    if (source.width <= 0 || source.height <= 0) {
      throw new PhotoImportError("decode", "Foto ini tidak punya gambar yang bisa dibaca.");
    }
    if (source.width * source.height > MAX_IMPORT_PIXELS) {
      throw new PhotoImportError(
        "memory",
        "Fotonya terlalu besar untuk diproses. Coba foto lain.",
      );
    }

    const scale = Math.min(1, MAX_IMPORT_EDGE / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new PhotoImportError("memory", "Browser tidak bisa menyiapkan kanvas foto.");
    }

    // JPEG has no alpha, so transparent PNGs get a clean paper-white bed rather
    // than black edges when they land in a slot.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    source.draw(ctx, width, height);

    let dataUrl: string;
    try {
      dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    } catch {
      throw new PhotoImportError("encode", "Foto gagal disiapkan. Coba foto lain.");
    }
    if (!dataUrl.startsWith("data:image/")) {
      throw new PhotoImportError("encode", "Foto gagal disiapkan. Coba foto lain.");
    }

    return { dataUrl, width, height };
  } finally {
    source.dispose();
  }
}

export function photoImportMessage(error: unknown): string {
  if (error instanceof PhotoImportError) return error.message;
  return "Foto gagal diunggah. Coba foto lain.";
}
