import { eq, sql } from "drizzle-orm";
import { IconDownload, IconQrcode, IconTrash } from "@tabler/icons-react";
import QRCode from "qrcode";
import type { Metadata } from "next";
import Link from "next/link";

import { db } from "@/db";
import { events, photoSessions } from "@/db/schema";
import { LAYOUTS } from "@/lib/layouts";
import { absoluteUrl } from "@/lib/site";

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
        <div className="border border-line bg-sunken p-4">
          <img
            src={session.finalPhotoUrl}
            alt="Strip foto hasil"
            className="mx-auto max-h-[70vh] w-auto border border-line"
          />
        </div>

        <div className="flex flex-col gap-8">
          <div className="border border-line bg-elev p-6">
            <div className="flex items-start gap-4">
              <img
                src={qrDataUrl}
                alt={`QR untuk ${shareUrl}`}
                className="size-40 shrink-0 border border-line"
              />
              <div>
                <p className="label">Bagikan</p>
                <p className="mt-2 text-ink-body">
                  Pindai QR ini untuk membuka lagi strip fotomu di HP lain.
                </p>
                <p className="mt-3 break-all font-mono text-label text-meta">
                  {shareUrl}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <a
              href={`/api/sessions/${accessKey}/download`}
              className="inline-flex items-center justify-center gap-2 border border-accent bg-accent px-6 py-3 text-body font-medium text-on-accent transition-colors duration-150 hover:bg-accent-hover"
            >
              <IconDownload size={20} stroke={1.75} aria-hidden="true" />
              Unduh PNG
            </a>
            <p className="font-mono text-label tracking-[0.16em] uppercase text-meta">
              {session.downloadCount} kali diunduh
            </p>
          </div>

          <dl className="grid gap-px border border-line bg-line">
            <div className="bg-elev p-4">
              <dt className="label">Layout</dt>
              <dd className="mt-1 text-ink-body">{layout.label}</dd>
            </div>
            {session.eventTitle && (
              <div className="bg-elev p-4">
                <dt className="label">Event</dt>
                <dd className="mt-1 text-ink-body">{session.eventTitle}</dd>
              </div>
            )}
            <div className="bg-elev p-4">
              <dt className="label">Berlaku sampai</dt>
              <dd className="mt-1 text-ink-body">
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
      <header className="border-b border-line">
        <div className="shell flex h-16 items-center justify-between">
          <Link
            href="/"
            className="font-mono text-label font-semibold tracking-[0.16em] uppercase"
          >
            SNAPVIBE
          </Link>
          <span className="inline-flex items-center gap-2 font-mono text-label tracking-[0.16em] uppercase text-meta">
            <IconQrcode size={16} stroke={1.75} aria-hidden="true" />
            Hasil
          </span>
        </div>
      </header>

      <main className="flex-1">
        <div className="shell py-[var(--section)]">
          <h1 className="text-display font-semibold">{title}</h1>
          <div className="mt-8">{children}</div>
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="shell flex items-center gap-2 py-6 font-mono text-label tracking-[0.16em] uppercase text-meta">
          <IconTrash size={16} stroke={1.75} aria-hidden="true" />
          Foto dihapus otomatis setelah masa retensi habis
        </div>
      </footer>
    </div>
  );
}
