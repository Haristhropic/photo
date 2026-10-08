import {
  IconBolt,
  IconCamera,
  IconDownload,
  IconLock,
  IconQrcode,
  IconRepeat,
  IconShieldCheck,
  IconTrash,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import Link from "next/link";

import { Faq } from "@/components/faq";
import { GalleryGrid } from "@/components/gallery-grid";
import { LiveStrip } from "@/components/live-strip";
import { LAYOUTS, LAYOUT_ORDER } from "@/lib/layouts";
import { Logo } from "@/components/logo";

const btnPrimary =
  "pressable inline-flex items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-pink px-7 py-4 font-display text-lead font-bold text-ink shadow-lift-2 hover:bg-[var(--mix-coral)]";

const btnGhost =
  "pressable inline-flex items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-elev px-7 py-4 font-display text-lead font-bold text-ink shadow-lift-2 hover:bg-butter";

const btnInk =
  "pressable inline-flex items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-butter px-6 py-3 font-display text-body font-bold text-ink shadow-lift-1 hover:bg-butter/85";

const STEP_INKS = ["var(--pink)", "var(--mint)", "var(--sky)"];
const FEATURE_TILTS = [-1.1, 0.8, -0.7, 1, -0.9];
const PRIVACY_INKS = [
  "var(--mix-coral)",
  "var(--mint)",
  "var(--butter)",
  "var(--sky)",
];

const STEPS: { icon: TablerIcon; title: string; body: string }[] = [
  {
    icon: IconCamera,
    title: "Buka linknya",
    body: "Tamu buka link di HP sendiri. Nggak perlu install aplikasi, nggak perlu antre di depan laptop.",
  },
  {
    icon: IconBolt,
    title: "Tiap 3 detik",
    body: "Hitung mundur 3-2-1 di tiap bidikan, jadi setiap orang dapat salinan dengan posisi berbeda.",
  },
  {
    icon: IconDownload,
    title: "QR atau unduh",
    body: "Setiap sesi dapat link sendiri. Pindai QR, unduh PNG, atau kirim ke grup chat.",
  },
];

const FEATURES: {
  icon: TablerIcon;
  title: string;
  body: string;
  ink: string;
  hero?: boolean;
  onDark?: boolean;
}[] = [
  {
    icon: IconRepeat,
    title: "Retake tanpa batas",
    body: "Nggak puas? Ambil ulang sebanyak yang kamu mau sebelum nyimpen. Nggak ada koin, nggak ada batas.",
    ink: "var(--mint)",
    hero: true,
  },
  {
    icon: IconShieldCheck,
    title: "Enam filter",
    body: "Warna, kontras, dan tone. Semuanya di-render di HP kamu.",
    ink: "var(--sky)",
  },
  {
    icon: IconQrcode,
    title: "QR per sesi",
    body: "Tiap orang dapat link sendiri, bukan satu link bersama.",
    ink: "var(--butter)",
  },
  {
    icon: IconLock,
    title: "Event bisa dikunci",
    body: "Pakai access code supaya cuma tamu yang punya kode yang bisa masuk booth.",
    ink: "var(--mix-plum)",
    onDark: true,
  },
  {
    icon: IconTrash,
    title: "Foto hilang sendiri",
    body: "Dihapus otomatis 24 jam setelah diambil, atau 7 hari untuk mode event. Kamu nggak perlu inget.",
    ink: "var(--orange)",
  },
];

const FAQ = [
  {
    q: "Apakah perlu install aplikasi?",
    a: "Tidak. Buka link di browser HP, izinkan akses kamera, lalu langsung jepret.",
  },
  {
    q: "Berapa lama foto tersimpan?",
    a: "Default 24 jam sejak sesi dibuat. Untuk event, organizer bisa memilih 7 hari.",
  },
  {
    q: "Bisa dipakai untuk event perusahaan?",
    a: "Bisa. Buat event dengan kode akses, unggah frame sendiri, lalu bagikan linknya ke tamu.",
  },
  {
    q: "Kalau kamera tidak bisa dibuka?",
    a: "Berikan izin kamera di pengaturan browser. Booth juga menampilkan pesan error yang jelas kalau izin ditolak.",
  },
];

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-50 border-b-2 border-ink bg-bg/90 backdrop-blur">
        <div className="shell flex h-18 items-center justify-between py-2">
          <Link
            href="/"
            className="font-display text-h3 font-extrabold tracking-tight transition-transform hover:-rotate-2"
          >
            <Logo className="h-12 w-auto" />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Utama">
            <Link
              href="/#cara-kerja"
              className="hidden rounded-[var(--radius-pill)] px-4 py-2 font-display text-small font-bold text-ink-body transition-colors hover:bg-butter hover:text-ink sm:inline-block"
            >
              Cara kerja
            </Link>
            <Link
              href="/#layout"
              className="hidden rounded-[var(--radius-pill)] px-4 py-2 font-display text-small font-bold text-ink-body transition-colors hover:bg-butter hover:text-ink sm:inline-block"
            >
              Layout
            </Link>
            <Link
              href="/booth"
              className="pressable rounded-[var(--radius)] border-2 border-ink bg-mint px-5 py-2.5 font-display text-small font-bold text-ink shadow-lift-1"
            >
              Buka Booth
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="shell relative grid gap-14 py-[clamp(3rem,7vw,6rem)] lg:grid-cols-[1fr_0.92fr] lg:items-center">
            <div>
              <h1 className="text-display font-extrabold">
                Booth fotonya
                <br />
                <span className="relative inline-block">
                  <span className="relative z-10">HP kamu.</span>
                  <span
                    className="absolute inset-x-0 bottom-1 z-0 h-4 -rotate-1 rounded-[6px] bg-butter"
                    aria-hidden="true"
                  />
                </span>
                <br />
                Nggak perlu alat.
              </h1>
              <p className="mt-7 max-w-[var(--measure)] text-lead text-ink-body">
                Satu link. Tamu buka di HP sendiri, jepret bareng-bareng dengan
                hitung mundur 3 detik per bidikan, dapat stripnya lewat QR.
                Nggak ada antre, nggak ada operator, nggak ada yang harus
                diinstal.
              </p>
              <div className="mt-9 flex flex-wrap gap-4">
                <Link href="/booth" className={btnPrimary}>
                  <IconCamera size={22} stroke={2.25} aria-hidden="true" />
                  Coba jepret sekarang
                </Link>
                <Link href="/#cara-kerja" className={btnGhost}>
                  Cara kerjanya
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-2">
                <span className="rounded-[var(--radius-pill)] border-2 border-ink bg-butter px-4 py-1.5 font-display text-label font-bold tracking-[0.1em] text-ink uppercase">
                  Nggak perlu install
                </span>
                <span className="rounded-[var(--radius-pill)] border-2 border-ink bg-mint px-4 py-1.5 font-display text-label font-bold tracking-[0.1em] text-ink uppercase">
                  Foto auto terhapus
                </span>
              </div>
            </div>

            <div>
              <LiveStrip />
            </div>
          </div>
        </section>

        <section id="cara-kerja" className="border-y-2 border-ink bg-elev">
          <div className="shell py-[var(--section)]">
            <h2 className="text-h2 font-extrabold">Tiga langkah, nol antre</h2>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <article
                  key={step.title}
                  className="pressable relative rounded-[var(--radius-lg)] border-2 border-ink bg-bg p-7 shadow-lift-2"
                  style={{ transform: `rotate(${i === 0 ? -1 : i === 2 ? 1 : 0}deg)` }}
                >
                  <span
                    className="absolute -top-4 left-6 grid size-11 place-items-center rounded-full border-2 border-ink font-display text-h3 font-extrabold text-ink shadow-lift-1"
                    style={{ background: STEP_INKS[i] }}
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <h3 className="mt-6 text-h3 font-extrabold">{step.title}</h3>
                  <p className="mt-3 text-ink-body">{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="layout">
          <div className="shell py-[var(--section)]">
            <h2 className="text-h2 font-extrabold">Pilih layout</h2>
            <p className="mt-4 max-w-[var(--measure)] text-lead text-ink-body">
              Empat susun siap pakai. Ganti layout kapan saja sebelum menekan
              tombol jepret.
            </p>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {LAYOUT_ORDER.map((key) => {
                const layout = LAYOUTS[key];
                return (
                  <article
                    key={key}
                    className="pressable flex flex-col rounded-[var(--radius-lg)] border-2 border-ink bg-elev p-5 shadow-lift-2"
                  >
                    <div className="grid h-40 place-items-center rounded-[10px] border-2 border-ink bg-sunken p-3">
                      <div
                        className="flex max-h-full gap-1"
                        style={{
                          aspectRatio: `${layout.canvas.w} / ${layout.canvas.h}`,
                          height: "100%",
                        }}
                      >
                        {layout.slots.map((slot, i) => (
                          <div
                            key={i}
                            className="flex-1 rounded-[2px] bg-bg-elev ring-1 ring-ink/20"
                          />
                        ))}
                      </div>
                    </div>
                    <h3 className="mt-5 font-display text-h3 font-extrabold">{layout.label}</h3>
                    <p className="mt-1 font-display text-label font-bold tracking-[0.12em] text-ink-meta uppercase">
                      {layout.shotCount} bidikan
                    </p>
                    <p className="mt-2 text-small text-ink-body">{layout.blurb}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-y-2 border-ink bg-plum py-[var(--section)] text-bg">
          <div className="shell">
            <h2 className="text-h2 font-extrabold text-butter">
              Yang bikin beda
            </h2>

            <div className="mt-12 grid gap-6 lg:grid-cols-4">
              {FEATURES.map((feature, i) => (
                <article
                  key={feature.title}
                  className={`pressable relative flex flex-col border-2 border-ink shadow-lift-2 ${
                    feature.hero
                      ? "justify-between rounded-[var(--radius-xl)] p-8 shadow-lift-3 lg:col-span-2 lg:row-span-2 lg:p-10"
                      : "rounded-[var(--radius-lg)] p-6"
                  }`}
                  style={{
                    background: feature.ink,
                    transform: `rotate(${FEATURE_TILTS[i % FEATURE_TILTS.length]}deg)`,
                  }}
                >
                  <span
                    className={`grid shrink-0 place-items-center rounded-full border-2 border-ink bg-ink text-bg shadow-lift-1 ${
                      feature.hero ? "size-32" : "size-14"
                    }`}
                    aria-hidden="true"
                  >
                    <feature.icon size={feature.hero ? 64 : 26} stroke={2.5} />
                  </span>

                  <h3
                    className={`mt-6 font-display font-extrabold ${
                      feature.hero ? "text-h2" : "text-h3"
                    } ${feature.onDark ? "text-bg" : "text-ink"}`}
                  >
                    {feature.title}
                  </h3>
                  <p
                    className={`mt-3 max-w-[var(--measure)] ${
                      feature.hero ? "text-lead" : "text-body"
                    } ${feature.onDark ? "text-bg" : "text-ink"}`}
                  >
                    {feature.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="shell grid gap-10 py-[var(--section)] lg:grid-cols-[1fr_1fr]">
            <div>
              <h2 className="text-h2 font-extrabold">Privasi by default</h2>
              <p className="mt-4 max-w-[var(--measure)] text-lead text-ink-body">
                Foto punya access key unik, tidak bergantung pada nomor HP, dan
                dihapus otomatis sesuai kebijakan retensi event.
              </p>
            </div>
            <dl className="grid gap-4 self-start">
              {[
                ["Akses", "QR dan access key acak 20 karakter"],
                ["Penyimpanan", "File lokal, bisa dipindah ke object storage"],
                ["Retensi", "24 jam default, 7 hari untuk mode event"],
                ["Pembersihan", "Cron harian menghapus yang kedaluwarsa"],
              ].map(([term, detail], i) => (
                <div
                  key={term}
                  className="rounded-[var(--radius)] border-2 border-ink bg-elev p-5"
                  style={{ background: PRIVACY_INKS[i] }}
                >
                  <dt className="font-display text-label font-extrabold tracking-[0.12em] text-ink uppercase">
                    {term}
                  </dt>
                  <dd className="mt-1 text-ink">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t-2 border-ink bg-elev">
          <div className="shell py-[var(--section)]">
            <h2 className="text-h2 font-extrabold">Pertanyaan umum</h2>
            <Faq items={FAQ} />
          </div>
        </section>

        <section>
          <div className="shell py-[var(--section)]">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-h2 font-extrabold text-ink">
                  Galeri publik
                </h2>
                <p className="mt-3 max-w-[var(--measure)] text-lead text-ink-body">
                  Foto yang para tamu pilih untuk dibagikan ke semua orang.
                </p>
              </div>
              <Link
                href="/gallery"
                className="pressable inline-flex items-center rounded-[var(--radius-pill)] border-2 border-ink bg-elev px-5 py-2 font-display text-label font-bold tracking-[0.1em] text-ink uppercase shadow-lift-1"
              >
                Lihat semua
              </Link>
            </div>
            <div className="mt-8">
              <GalleryGrid />
            </div>
          </div>
        </section>

        <section>
          <div className="shell pb-[var(--section)]">
            <div
              className="rounded-[var(--radius-xl)] border-2 border-ink bg-pink p-9 shadow-lift-3 sm:p-14"
              style={{ transform: "rotate(-0.5deg)" }}
            >
              <h2 className="text-h2 font-extrabold text-ink">Siap jepret?</h2>
              <p className="mt-4 max-w-[var(--measure)] text-lead font-semibold text-ink">
                Buka booth, pilih layout, dan bagikan linknya ke semua orang di
                ruangan. Tiga detik per bidikan.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link href="/booth" className={btnInk}>
                  <IconCamera size={22} stroke={2.25} aria-hidden="true" />
                  Buka Booth
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t-2 border-ink bg-butter">
        <div className="shell flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-display text-h3 font-extrabold text-ink">
            <Logo className="h-10 w-auto" />
          </p>
          <nav className="flex flex-wrap gap-3" aria-label="Footer">
            <Link
              href="/booth"
              className="rounded-[var(--radius-pill)] border-2 border-ink bg-elev px-4 py-1.5 font-display text-small font-bold text-ink transition-colors hover:bg-mint"
            >
              Booth
            </Link>
            <Link
              href="/gallery"
              className="rounded-[var(--radius-pill)] border-2 border-ink bg-elev px-4 py-1.5 font-display text-small font-bold text-ink transition-colors hover:bg-mint"
            >
              Galeri
            </Link>
            <Link
              href="/privacy"
              className="rounded-[var(--radius-pill)] border-2 border-ink bg-elev px-4 py-1.5 font-display text-small font-bold text-ink transition-colors hover:bg-mint"
            >
              Privasi
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
