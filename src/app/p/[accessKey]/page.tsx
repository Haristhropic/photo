import { eq, sql } from "drizzle-orm";
import { IconCamera, IconQrcode, IconTrash } from "@tabler/icons-react";
import QRCode from "qrcode";
import type { Metadata } from "next";
import Link from "next/link";

import { DownloadButton } from "@/components/download-button";
import { db } from "@/db";
import { events, photoSessions } from "@/db/schema";
import { LAYOUTS } from "@/lib/layouts";
import { absoluteUrl } from "@/lib/site";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "Hasil fotomu: SnapVibe",
  description: "Unduh strip fotomu atau bagikan tautannya.",
};

export default async function ResultPage(props: PageProps<"/p/[accessKey]">) {
  const { accessKey } = await props.params;

  const rows = await db
    .select({
      id: photoSessions.id,
      finalPhotoUrl: photoSessions.finalPhotoUrl,
      downloadCount: photoSessions.downloadCount,
      expiresAt: photoSessions.expiresAt,
      layoutType: photoSessions.layoutType,
      eventTitle: events.title,
      isExpired: sql<number>`${photoSessions.expiresAt} < (now() at time zone 'utc')`,
    })
    .from(photoSessions)
    .leftJoin(events, eq(photoSessions.eventId, events.id))
    .where(eq(photoSessions.accessKey, accessKey))
    .limit(1);

  const session = rows[0];

  if (!session) {
    return (
      <Shell title="Foto tidak ditemukan">
        <p className="text-lead text-ink-body">
          Tautan ini tidak dikenali. Cek kembali QR yang kamu terima.
        </p>
      </Shell>
    );
  }

  const expired = Boolean(session.isExpired);
  const shareUrl = absoluteUrl(`/p/${accessKey}`);

  if (expired) {
    return (
      <Shell title="Foto sudah kedaluwarsa">
        <p className="text-lead text-ink-body">
          Foto ini sudah dihapus sesuai kebijakan retensi. Minta tamu membuka
          booth lagi.
        </p>
      </Shell>
    );
  }

  const qrDataUrl = await QRCode.toDataURL(shareUrl, {
    margin: 1,
    width: 512,
    errorCorrectionLevel: "M",
    color: { dark: "#111114", light: "#ffffff" },
  });

  const layout = LAYOUTS[session.layoutType];

  return (
    <Shell title="Fotomu sudah jadi">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <div
          className="rounded-[var(--radius-xl)] border-2 border-ink bg-ink p-3 shadow-lift-3"
          style={{ transform: "rotate(-0.8deg)" }}
        >
          <img
            src={session.finalPhotoUrl}
            alt="Strip foto hasil"
            className="mx-auto max-h-[70vh] w-auto rounded-[6px]"
          />
        </div>

        <div className="flex flex-col gap-6">
          <div
            className="rounded-[var(--radius-lg)] border-2 border-ink bg-butter p-6 shadow-lift-2"
            style={{ transform: "rotate(0.8deg)" }}
          >
            <div className="flex items-start gap-5">
              <img
                src={qrDataUrl}
                alt={`QR untuk ${shareUrl}`}
                className="size-40 shrink-0 rounded-[var(--radius)] border-2 border-ink bg-elev"
              />
              <div>
                <p className="font-display text-label font-extrabold tracking-[0.12em] text-ink uppercase">
                  Bagikan
                </p>
                <p className="mt-2 font-semibold text-ink">
                  Pindai QR ini untuk membuka lagi strip fotomu di HP lain.
                </p>
                <p className="mt-3 break-all rounded-[10px] border-2 border-ink bg-elev px-3 py-2 font-display text-label font-bold text-ink">
                  {shareUrl}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <DownloadButton
              accessKey={accessKey}
              href={`/api/sessions/${accessKey}/download`}
              initialCount={session.downloadCount}
            />
            <Link
              href={`/booth?from=p/${encodeURIComponent(accessKey)}`}
              className="pressable inline-flex items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-elev px-6 py-4 font-display text-lead font-bold text-ink shadow-lift-2 hover:bg-mint"
            >
              <IconCamera size={22} stroke={2.5} aria-hidden="true" />
              Boleh jepret lagi?
            </Link>
          </div>

          <dl className="grid gap-3">
            <div className="rounded-[var(--radius)] border-2 border-ink bg-elev p-4 shadow-lift-1">
              <dt className="font-display text-label font-extrabold tracking-[0.12em] text-ink-meta uppercase">
                Layout
              </dt>
              <dd className="mt-1 font-semibold text-ink">{layout.label}</dd>
            </div>
            {session.eventTitle && (
              <div className="rounded-[var(--radius)] border-2 border-ink bg-elev p-4 shadow-lift-1">
                <dt className="font-display text-label font-extrabold tracking-[0.12em] text-ink-meta uppercase">
                  Event
                </dt>
                <dd className="mt-1 font-semibold text-ink">{session.eventTitle}</dd>
              </div>
            )}
            <div className="rounded-[var(--radius)] border-2 border-ink bg-elev p-4 shadow-lift-1">
              <dt className="font-display text-label font-extrabold tracking-[0.12em] text-ink-meta uppercase">
                Berlaku sampai
              </dt>
              <dd className="mt-1 font-semibold text-ink">
                {session.expiresAt.toLocaleString("id-ID", {
                  dateStyle: "long",
                  timeStyle: "short",
                })}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b-2 border-ink">
        <div className="shell flex h-18 items-center justify-between py-2">
          <Link
            href="/"
            className="font-display text-h3 font-extrabold"
          >
            <Logo className="h-12 w-auto" />
          </Link>
          <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border-2 border-ink bg-mint px-4 py-1.5 font-display text-label font-bold tracking-[0.12em] text-ink uppercase">
            <IconQrcode size={16} stroke={2.5} aria-hidden="true" />
            Hasil
          </span>
        </div>
      </header>

      <main className="flex-1">
        <div className="shell py-[var(--section)]">
          <h1 className="text-display font-extrabold">{title}</h1>
          <div className="mt-10">{children}</div>
        </div>
      </main>

      <footer className="border-t-2 border-ink bg-butter">
        <div className="shell flex items-center gap-2 py-6 font-display text-label font-bold tracking-[0.12em] text-ink uppercase">
          <IconTrash size={16} stroke={2.5} aria-hidden="true" />
          Foto dihapus otomatis setelah masa retensi habis
        </div>
      </footer>
    </div>
  );
}
