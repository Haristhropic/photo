import Link from "next/link";

import { GalleryGrid } from "@/components/gallery-grid";
import { Logo } from "@/components/logo";

export const metadata = {
  title: "Galeri: SnapVibe",
    description: "Foto-foto yang diunggah sendiri oleh para tamu SnapVibe.",
};

export default function GalleryPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b-2 border-ink">
        <div className="shell flex h-18 items-center justify-between gap-3 py-2">
          <Link
            href="/"
            aria-label="SnapVibe, kembali ke beranda"
            className="font-display text-h3 font-extrabold"
          >
            <Logo className="h-12 w-auto" />
          </Link>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span className="hidden rounded-[var(--radius-pill)] border-2 border-ink bg-butter px-4 py-1.5 font-display text-label font-extrabold tracking-[0.12em] text-ink uppercase sm:inline-flex">
              Galeri
            </span>
            <Link
              href="/booth?from=home"
              className="pressable inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-pill)] border-2 border-ink bg-mint px-3.5 py-1.5 font-display text-label font-bold tracking-[0.1em] text-ink uppercase shadow-lift-1"
            >
              <span className="sr-only sm:not-sr-only">Buka booth</span>
              <span aria-hidden="true">Booth</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="shell flex flex-1 flex-col py-10">
        <div className="max-w-[var(--measure)]">
          <h1 className="font-display text-display font-extrabold text-ink">
            Galeri publik
          </h1>
          <p className="mt-3 text-lead text-ink-body">
            Setiap foto di sini diunggah sendiri oleh orang yang memotretnya.
            Kalau fotomu tidak muncul, berarti tidak ada yang mencentang
            bagikan.
          </p>
        </div>

        <GalleryGrid />
      </main>
    </div>
  );
}
