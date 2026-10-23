import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Privasi: SnapVibe",
  description: "Cara SnapVibe menyimpan, menampilkan, dan menghapus fotomu.",
};

export default function PrivacyPage() {
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
          <div className="flex items-center gap-2 sm:gap-3">
            <BackLink href="/" label="Beranda" />
            <span className="rounded-[var(--radius-pill)] border-2 border-ink bg-plum px-4 py-1.5 font-display text-label font-bold tracking-[0.12em] text-butter uppercase">
              Privasi
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="shell max-w-[var(--measure)] py-[var(--page)]">
          <h1 className="text-display font-extrabold">Privasi</h1>

          <div className="mt-10 flex flex-col gap-6 text-lead text-ink-body">
            <section className="rounded-[var(--radius-lg)] border-2 border-ink bg-elev p-7 shadow-lift-1">
              <h2 className="font-display text-h2 font-extrabold text-ink">
                Yang kami simpan
              </h2>
              <p className="mt-3">
                SnapVibe menyimpan strip foto hasil jepretanmu beserta tautan
                unduhnya. Foto tidak&rsquo;mengenai nama, email, atau nomor
                telepon, dan tidak disimpan di perangkat kamu.
              </p>
            </section>

            <section className="rounded-[var(--radius-lg)] border-2 border-ink bg-elev p-7 shadow-lift-1">
              <h2 className="font-display text-h2 font-extrabold text-ink">
                Siapa yang bisa melihat
              </h2>
              <p className="mt-3">
                Setiap sesi punya tautan acak sendiri. Siapa pun yang punya
                tautan atau QR itu bisa membuka dan mengunduh fotomu, jadi
                simpan tautannya dan jangan bagikan ke publik.
              </p>
            </section>

            <section className="rounded-[var(--radius-lg)] border-2 border-ink bg-elev p-7 shadow-lift-1">
              <h2 className="font-display text-h2 font-extrabold text-ink">
                Berapa lama disimpan
              </h2>
              <p className="mt-3">
                Foto dihapus otomatis setelah masa retensi event habis. Masa
                retensi tiap event diatur organizer dan bisa berbeda.
              </p>
            </section>

            <section className="rounded-[var(--radius-lg)] border-2 border-ink bg-elev p-7 shadow-lift-1">
              <h2 className="font-display text-h2 font-extrabold text-ink">
                Kalau ada yang salah
              </h2>
              <p className="mt-3">
                Kalau kamu yakin ada tautan yang salah orang, hubungi organizer
                event yang membagikannya.
              </p>
            </section>
          </div>

        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
