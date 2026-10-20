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
const PRIVACY_FRAMES = [
  {
    title: "Tanpa akun.",
    body: "Cukup link acak 20 karakter.",
    ink: "var(--mint)",
  },
  {
    title: "Tanpa identitas.",
    body: "Nggak ada nama atau nomor HP di strip.",
    ink: "var(--sky)",
  },
  {
    title: "Galeri itu pilihan.",
    body: "Cuma kalau tamu membagikannya.",
    ink: "var(--orange)",
  },
];

const LAYOUT_INKS = [
  "var(--mix-coral)",
  "var(--mint)",
  "var(--butter)",
  "var(--sky)",
];

const STEPS: { icon: TablerIcon; title: string; body: string }[] = [
  {
    icon: IconCamera,
    title: "Buka linknya",
    body: "Buka SnapVibe di browser HP, lalu pilih layout. Nggak perlu install apa pun, cukup izinkan kamera sekali.",
  },
  {
    icon: IconBolt,
    title: "Jepret 3-2-1",
    body: "Tekan Aktifkan kamera, lalu Jepret. Tiap bidikan punya hitung mundur 3 detik dan jumlahnya ikut layout yang kamu pilih, jadi kamu sempat atur pose.",
  },
  {
    icon: IconDownload,
    title: "Unduh dan bagikan",
    body: "Atur filter dan stiker di studio, lalu tekan Simpan dan buat QR. Strip dan QR-nya langsung muncul, siap diunduh sebagai PNG atau dibuka di HP lain.",
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
    body: "Dihapus otomatis sesuai masa simpan event, default 24 jam. Kamu nggak perlu inget.",
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
    a: "Default 24 jam sejak sesi dibuat. Organizer event bisa mengubahnya, dari 1 jam sampai 30 hari.",
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
              {LAYOUT_ORDER.map((key, index) => {
                const layout = LAYOUTS[key];
                const ink = LAYOUT_INKS[index % LAYOUT_INKS.length];
                return (
                  <article
                    key={key}
                    className="pressable flex flex-col rounded-[var(--radius-lg)] border-2 border-ink bg-elev p-5 shadow-lift-2"
                  >
                    <div className="flex h-44 items-center justify-center rounded-[10px] border-2 border-ink bg-sunken p-3">
                      {/* A true-scale preview. Every slot sits where
                          renderStrip actually draws it, so the card shows the
                          real arrangement instead of a row of equal boxes. */}
                      <div
                        style={{
                          aspectRatio: `${layout.canvas.w} / ${layout.canvas.h}`,
                          height: "100%",
                          transform: `rotate(${index % 2 === 0 ? -1 : 1}deg)`,
                        }}
                      >
                        <svg
                          viewBox={`0 0 ${layout.canvas.w} ${layout.canvas.h}`}
                          style={{ display: "block", width: "100%", height: "100%" }}
                          role="img"
                          aria-label={`Contoh susunan ${layout.label}: ${layout.blurb}, ${layout.shotCount} bidikan`}
                        >
                          <rect
                            width={layout.canvas.w}
                            height={layout.canvas.h}
                            rx={layout.canvas.w * 0.02}
                            fill="var(--bg)"
                            stroke="var(--ink)"
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                          />
                          {layout.slots.map((slot, slotIndex) => {
                            const cx = slot.x + slot.w / 2;
                            const cy = slot.y + slot.h / 2;
                            // The glyph is drawn in a 100-unit box, so scale it
                            // to sit inside the slot with breathing room.
                            const scale = (Math.min(slot.w, slot.h) * 0.62) / 100;
                            return (
                              <g key={slotIndex}>
                                <rect
                                  x={slot.x}
                                  y={slot.y}
                                  width={slot.w}
                                  height={slot.h}
                                  rx={layout.canvas.w * 0.012}
                                  fill={ink}
                                  stroke="var(--ink)"
                                  strokeWidth="1.5"
                                  vectorEffect="non-scaling-stroke"
                                />
                                <g
                                  transform={`translate(${cx} ${cy}) scale(${scale})`}
                                  fill="var(--ink)"
                                  opacity="0.45"
                                >
                                  <circle cy="-20" r="20" />
                                  <path d="M -42 46a42 34 0 0 1 84 0z" />
                                </g>
                              </g>
                            );
                          })}
                        </svg>
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

        <section className="bg-butter">
          <div className="shell grid gap-14 py-[var(--section)] lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
            <div>
              <h2 className="text-[clamp(2.6rem,1.3rem_+_4.2vw,4.75rem)] leading-[0.92] font-extrabold tracking-[-0.03em]">
                Fotonya cuma{" "}
                <br />
                <span className="relative inline-block">
                  <span className="relative z-10">mampir.</span>
                  <span
                    aria-hidden="true"
                    className="absolute -inset-x-2 bottom-[0.08em] z-0 h-[0.34em] -rotate-[1.4deg] rounded-[3px] bg-pink"
                  />
                </span>
              </h2>
              <p className="mt-6 max-w-[36ch] text-lead text-ink-body">
                Disimpan <strong className="font-bold text-ink">24 jam</strong>,
                lalu dihapus otomatis.{" "}
                <span className="whitespace-nowrap">Link-nya</span> mati, filenya
                hilang beneran.
              </p>
              <div className="mt-7 inline-flex max-w-full -rotate-[1.6deg] items-start gap-2.5 rounded-[6px] border-2 border-ink bg-elev px-3.5 py-2.5 shadow-lift-1">
                <span
                  className="reg-cross mt-[0.3em] size-3 shrink-0"
                  aria-hidden="true"
                />
                <p className="font-display text-label leading-[1.55] font-bold tracking-[0.12em] text-meta uppercase">
                  Default 24 jam
                  <br />
                  <span className="whitespace-nowrap">1–30 hari</span> per event
                </p>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[264px]">
              <div className="-rotate-[2.5deg] rounded-[20px] border-2 border-ink bg-elev p-3 shadow-lift-3">
                <ul className="grid gap-2">
                  {PRIVACY_FRAMES.map((frame) => (
                    <li
                      key={frame.title}
                      className="flex aspect-[4/3] flex-col justify-center rounded-[10px] border-2 border-ink p-4"
                      style={{ background: frame.ink }}
                    >
                      <p className="font-display text-h3 font-extrabold text-ink">
                        {frame.title}
                      </p>
                      <p className="mt-1 text-small font-semibold text-ink">
                        {frame.body}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="mt-2.5 px-1 font-display text-label font-bold tracking-[0.12em] text-ink-meta uppercase">
                  SnapVibe
                </p>
              </div>

              <span
                aria-hidden="true"
                className="absolute -right-8 -bottom-6 rotate-[7deg] rounded-[6px] border-[3px] border-ink bg-pink px-3.5 py-2 text-center font-display uppercase shadow-lift-1"
              >
                <span className="block text-[0.6rem] font-extrabold tracking-[0.22em] text-ink">
                  Kedaluwarsa
                </span>
                <span className="mt-0.5 block text-[1.35rem] leading-none font-extrabold tracking-tight text-ink">
                  24 jam
                </span>
              </span>
            </div>
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
