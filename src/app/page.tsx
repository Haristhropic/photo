import {
  IconBolt,
  IconCamera,
  IconDownload,
  IconLayoutGrid,
  IconLock,
  IconQrcode,
  IconRepeat,
  IconShieldCheck,
  IconTrash,
} from "@tabler/icons-react";
import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { LAYOUTS, LAYOUT_ORDER } from "@/lib/layouts";

const btnPrimary =
  "inline-flex items-center justify-center gap-2 border border-accent bg-accent px-6 py-3 text-ink-body font-medium text-on-accent transition-colors duration-150 ease-[var(--ease)] hover:bg-accent-hover hover:border-accent-hover";

const btnGhost =
  "inline-flex items-center justify-center gap-2 border border-line-strong px-6 py-3 text-ink-body font-medium text-ink transition-colors duration-150 ease-[var(--ease)] hover:border-ink";

const STEPS = [
  {
    icon: IconCamera,
    title: "Pilih layout",
    body: "Empat susun siap pakai: Strip 3, Strip 4, Grid 2x2, atau Single. Ganti kapan saja sebelum jepret.",
  },
  {
    icon: IconBolt,
    title: " Jepret bareng",
    body: "Hitung mundur 3-2-1, lalu beberapa bidikan terpotret otomatis. Semua orang bisa ambil salinannya tanpa antre.",
  },
  {
    icon: IconDownload,
    title: "QR untuk download",
    body: "Setiap sesi dapat access key dan QR sendiri. Unduh langsung, tidak perlu install apa pun.",
  },
];

const FEATURES = [
  {
    icon: IconLayoutGrid,
    title: "Empat layout",
    body: "Strip vertikal atau grid. Semua dirender di browser, lalu disimpan ke server.",
  },
  {
    icon: IconRepeat,
    title: "Retake gratis",
    body: "Tidak puas dengan hasilnya? Ambil ulang sebanyak yang kamu mau sebelum menyimpan.",
  },
  {
    icon: IconShieldCheck,
    title: "Filter dan frame",
    body: "Enam filter foto dan frame PNG yang diunggah organizer untuk tiap event.",
  },
  {
    icon: IconQrcode,
    title: "QR per sesi",
    body: "QR dibuat di server dan menunjuk ke halaman hasil khusus tiap peserta.",
  },
  {
    icon: IconLock,
    title: "Kode event",
    body: "Event privat bisa dikunci dengan access code agar hanya tamu yang punya kode.",
  },
  {
    icon: IconTrash,
    title: "Auto hapus",
    body: "Foto dihapus otomatis 24 jam setelah diambil, atau 7 hari untuk mode event.",
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
      <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur">
        <div className="shell flex h-16 items-center justify-between">
          <Link
            href="/"
            className="font-mono text-label font-semibold tracking-[0.16em] uppercase"
          >
            SNAPVIBE
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Utama">
            <Link
              href="/#cara-kerja"
              className="hidden px-3 py-2 text-small text-ink-body transition-colors hover:text-accent sm:inline-block"
            >
              Cara kerja
            </Link>
            <Link
              href="/#layout"
              className="hidden px-3 py-2 text-small text-ink-body transition-colors hover:text-accent sm:inline-block"
            >
              Layout
            </Link>
            <Link href="/booth" className={btnPrimary + " px-4 py-2 text-small"}>
              Buka Booth
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="border-b border-line">
          <div className="shell grid gap-12 py-[clamp(3rem,7vw,5.5rem)] lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <p className="label">Web photobooth</p>
              <h1 className="mt-5 text-display font-semibold">
                Strip foto event
                <br />
                dalam hitungan detik.
              </h1>
              <p className="mt-6 max-w-[var(--measure)] text-lead text-ink-body">
                Buka link, pilih layout, jepret bareng-bareng, lalu kirim hasil
                lewat QR. Semua berjalan di browser, tidak perlu install apa pun.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/booth" className={btnPrimary}>
                  <IconCamera size={20} stroke={1.75} aria-hidden="true" />
                  Mulai jepret
                </Link>
                <Link href="/#cara-kerja" className={btnGhost}>
                  Lihat cara kerja
                </Link>
              </div>
              <p className="mt-6 font-mono text-label tracking-[0.16em] uppercase text-meta">
                Gratis untuk event kecil
              </p>
            </div>

            <div className="border border-line bg-board p-6 text-board-ink">
              <div className="flex aspect-3/4 flex-col gap-3 border border-white/15 p-3">
                <div className="grid flex-1 grid-cols-1 gap-3">
                  {LAYOUTS.STRIP_3.slots.map((slot, i) => (
                    <div
                      key={i}
                      className="relative border border-white/20 bg-white/5"
                      style={{ aspectRatio: `${slot.w} / ${slot.h}` }}
                    >
                      <span className="absolute inset-0 grid place-items-center font-mono text-label text-white/40">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between font-mono text-label tracking-[0.16em] uppercase text-white/50">
                  <span>SNAPVIBE</span>
                  <span>STRIP 3</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="cara-kerja" className="border-b border-line">
          <div className="shell py-[var(--section)]">
            <h2 className="text-h2 font-semibold">Tiga langkah</h2>
            <div className="mt-10 grid gap-px border border-line bg-line md:grid-cols-3">
              {STEPS.map((step, i) => (
                <div key={step.title} className="bg-elev p-8">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center border border-line text-accent">
                      <step.icon size={20} stroke={1.75} aria-hidden="true" />
                    </span>
                    <span className="font-mono text-label tracking-[0.16em] text-meta">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="mt-5 text-h3 font-semibold">{step.title}</h3>
                  <p className="mt-3 text-ink-body text-ink-body">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="layout" className="border-b border-line">
          <div className="shell py-[var(--section)]">
            <h2 className="text-h2 font-semibold">Pilih layout</h2>
            <p className="mt-4 max-w-[var(--measure)] text-lead text-ink-body">
              Empat susun siap pakai. Ganti layout kapan saja sebelum menekan
              tombol jepret.
            </p>
            <div className="mt-10 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
              {LAYOUT_ORDER.map((key) => {
                const layout = LAYOUTS[key];
                return (
                  <div key={key} className="bg-elev p-6">
                    <div
                      className="flex gap-1 border border-line bg-sunken p-2"
                      style={{ aspectRatio: `${layout.canvas.w} / ${layout.canvas.h}` }}
                    >
                      {layout.slots.map((slot, i) => (
                        <div
                          key={i}
                          className="flex-1 border border-line-strong bg-elev"
                        />
                      ))}
                    </div>
                    <h3 className="mt-5 text-h3 font-semibold">{layout.label}</h3>
                    <p className="mt-1 font-mono text-label tracking-[0.16em] uppercase text-meta">
                      {layout.shotCount} bidikan
                    </p>
                    <p className="mt-2 text-small text-ink-body">{layout.blurb}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-b border-line">
          <div className="shell py-[var(--section)]">
            <h2 className="text-h2 font-semibold">Yang kamu dapat</h2>
            <div className="mt-10 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="bg-elev p-6">
                  <feature.icon
                    size={24}
                    stroke={1.75}
                    className="text-accent"
                    aria-hidden="true"
                  />
                  <h3 className="mt-4 text-h3 font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-ink-body text-ink-body">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-line">
          <div className="shell grid gap-10 py-[var(--section)] lg:grid-cols-[1fr_1fr]">
            <div>
              <h2 className="text-h2 font-semibold">Privasi by default</h2>
              <p className="mt-4 max-w-[var(--measure)] text-lead text-ink-body">
                Foto punya access key unik, tidak bergantung pada nomor HP, dan
                dihapus otomatis sesuai kebijakan retensi event.
              </p>
            </div>
            <dl className="grid gap-px self-start border border-line bg-line">
              {[
                ["Akses", "QR dan access key acak 20 karakter"],
                ["Penyimpanan", "File lokal, bisa dipindah ke object storage"],
                ["Retensi", "24 jam default, 7 hari untuk mode event"],
                ["Pembersihan", "Cron harian menghapus yang kedaluwarsa"],
              ].map(([term, detail]) => (
                <div key={term} className="bg-elev p-5">
                  <dt className="label">{term}</dt>
                  <dd className="mt-1 text-ink-body">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-b border-line">
          <div className="shell py-[var(--section)]">
            <h2 className="text-h2 font-semibold">Pertanyaan umum</h2>
            <div className="mt-10 grid gap-px border border-line bg-line">
              {FAQ.map((item) => (
                <div key={item.q} className="bg-elev p-6">
                  <h3 className="text-h3 font-semibold">{item.q}</h3>
                  <p className="mt-2 max-w-[var(--measure)] text-ink-body text-ink-body">
                    {item.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="shell py-[var(--section)]">
            <div className="border border-line bg-elev p-8 sm:p-12">
              <h2 className="text-h2 font-semibold">Siap jepret?</h2>
              <p className="mt-4 max-w-[var(--measure)] text-lead text-ink-body">
                Buka booth, pilih layout, dan bagikan QR ke semua orang di
                ruangan.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/booth" className={btnPrimary}>
                  <IconCamera size={20} stroke={1.75} aria-hidden="true" />
                  Buka Booth
                </Link>
                <Link href="/admin" className={btnGhost}>
                  Kelola event
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="shell flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-label tracking-[0.16em] uppercase text-meta">
            SnapVibe
          </p>
          <nav className="flex flex-wrap gap-4" aria-label="Footer">
            <Link
              href="/booth"
              className="text-small text-ink-body transition-colors hover:text-accent"
            >
              Booth
            </Link>
            <Link
              href="/admin"
              className="text-small text-ink-body transition-colors hover:text-accent"
            >
              Admin
            </Link>
            <Link
              href="/privacy"
              className="text-small text-ink-body transition-colors hover:text-accent"
            >
              Privasi
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
