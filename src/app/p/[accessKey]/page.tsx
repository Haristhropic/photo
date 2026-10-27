import { eq, sql } from "drizzle-orm";
import {
  IconCalendarEvent,
  IconCamera,
  IconClockHour4,
  IconHome,
  IconLayoutGrid,
  IconQrcode,
  IconShare,
} from "@tabler/icons-react";
import QRCode from "qrcode";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { BackLink } from "@/components/back-link";
import { DownloadButton } from "@/components/download-button";
import { SiteFooter } from "@/components/site-footer";
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
    <Shell
      title="Fotomu sudah jadi"
      back={{
        href: `/booth?from=p/${encodeURIComponent(accessKey)}`,
        label: "Booth",
      }}
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
        <div
          className="w-full min-w-0 justify-self-center rounded-[var(--radius-xl)] border-2 border-ink bg-ink p-3 shadow-lift-3 lg:justify-self-end"
          style={{
            transform: "rotate(-0.8deg)",
            maxWidth: `calc(${(70 * layout.canvas.w) / layout.canvas.h}vh + 1.5rem)`,
          }}
        >
          <Image
            src={session.finalPhotoUrl}
            alt="Strip foto hasil"
            width={layout.canvas.w}
            height={layout.canvas.h}
            sizes="(min-width: 1024px) 45vw, 90vw"
            priority
            className="mx-auto h-auto max-h-[70vh] w-auto max-w-full rounded-[6px]"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <div
            className="w-full rounded-[var(--radius-lg)] border-2 border-ink bg-butter p-6 shadow-lift-2"
            style={{ transform: "rotate(0.8deg)" }}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
              <img
                src={qrDataUrl}
                alt={`QR untuk ${shareUrl}`}
                width={160}
                height={160}
                className="size-40 shrink-0 self-center rounded-[var(--radius)] border-2 border-ink bg-elev sm:self-start"
              />
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-display text-label font-extrabold tracking-[0.12em] text-ink uppercase">
                  <IconShare size={15} stroke={2.5} aria-hidden="true" />
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
            <Link
              href="/"
              className="pressable inline-flex items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-elev px-6 py-4 font-display text-lead font-bold text-ink shadow-lift-2 hover:bg-butter"
            >
              <IconHome size={22} stroke={2.5} aria-hidden="true" />
              Kembali ke beranda
            </Link>
          </div>

          <dl className="grid gap-3">
            <div className="rounded-[var(--radius)] border-2 border-ink bg-elev p-4 shadow-lift-1">
              <dt className="flex items-center gap-2 font-display text-label font-extrabold tracking-[0.12em] text-ink-meta uppercase">
                <IconLayoutGrid size={15} stroke={2.5} aria-hidden="true" />
                Layout
              </dt>
              <dd className="mt-1 font-semibold text-ink">{layout.label}</dd>
            </div>
            {session.eventTitle && (
              <div className="rounded-[var(--radius)] border-2 border-ink bg-elev p-4 shadow-lift-1">
                <dt className="flex items-center gap-2 font-display text-label font-extrabold tracking-[0.12em] text-ink-meta uppercase">
                  <IconCalendarEvent size={15} stroke={2.5} aria-hidden="true" />
                  Event
                </dt>
                <dd className="mt-1 font-semibold text-ink">{session.eventTitle}</dd>
              </div>
            )}
            <div className="rounded-[var(--radius)] border-2 border-ink bg-elev p-4 shadow-lift-1">
              <dt className="flex items-center gap-2 font-display text-label font-extrabold tracking-[0.12em] text-ink-meta uppercase">
                <IconClockHour4 size={15} stroke={2.5} aria-hidden="true" />
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

function Shell({
  title,
  children,
  back,
}: {
  title: string;
  children: React.ReactNode;
  back?: { href: string; label: string; ariaLabel?: string };
}) {
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
            <BackLink
              href={back?.href ?? "/"}
              label={back?.label ?? "Beranda"}
              ariaLabel={back?.ariaLabel}
            />
            <span className="inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-pill)] border-2 border-ink bg-mint px-4 py-1.5 font-display text-label font-bold tracking-[0.12em] text-ink uppercase">
              <IconQrcode size={16} stroke={2.5} aria-hidden="true" />
              Hasil
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="shell py-[var(--page)]">
          <h1 className="text-display font-extrabold">{title}</h1>
          <div className="mt-10">{children}</div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
