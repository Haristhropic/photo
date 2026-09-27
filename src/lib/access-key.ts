import { randomBytes } from "node:crypto";

// Ambiguous glyphs (0, 1, l, o, i) are omitted so keys survive being read aloud
// or copied off a printed QR page. 32 symbols divides 256 exactly, so indexing
// by a random byte introduces no modulo bias.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

export function createAccessKey(length = 20): string {
  const bytes = randomBytes(length);
  let out = "";
  for (const byte of bytes) {
    out += ALPHABET[byte % ALPHABET.length];
  }
  return out;
}

export function createEventCode(length = 6): string {
  return createAccessKey(length).toUpperCase();
}

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "event";
}
