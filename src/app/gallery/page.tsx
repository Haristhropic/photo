import Link from "next/link";

import { BackLink } from "@/components/back-link";
import { GalleryGrid } from "@/components/gallery-grid";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";
import { getPublicGallery, type GalleryPhoto } from "@/lib/gallery";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Galeri: SnapVibe",
    description: "Foto-foto yang diunggah sendiri oleh para tamu SnapVibe.",
};

export default async function GalleryPage() {
  let initialPhotos: GalleryPhoto[] | undefined;
  try {
    initialPhotos = await getPublicGallery();
  } catch {
    // Keep the page usable when the database is temporarily unavailable; the
    // client component will show its own retry state.
    initialPhotos = undefined;
  }

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
            <BackLink href="/" label="Beranda" />
            <span className="hidden rounded-[var(--radius-pill)] border-2 border-ink bg-butter px-4 py-1.5 font-display text-label font-extrabold tracking-[0.12em] text-ink uppercase sm:inline-flex">
              Galeri
            </span>
            <Link
              href="/booth?from=home"
              aria-label="Buka booth"
              className="pressable inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-pill)] border-2 border-ink bg-mint px-3.5 py-1.5 font-display text-label font-bold tracking-[0.1em] text-ink uppercase shadow-lift-1"
            >
              Booth
            </Link>
          </div>
        </div>
      </header>

      <main className="shell flex flex-1 flex-col py-[var(--page)]">
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

        <GalleryGrid initialPhotos={initialPhotos} />
      </main>

      <SiteFooter />
    </div>
  );
}
