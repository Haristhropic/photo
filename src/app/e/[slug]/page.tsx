import { eq } from "drizzle-orm";
import { IconArrowRight, IconCamera, IconLock } from "@tabler/icons-react";
import Link from "next/link";
import type { Metadata } from "next";

import { EventJoinClient } from "@/components/event-join-client";
import { db } from "@/db";
import { events, frames } from "@/db/schema";
import { LAYOUTS } from "@/lib/layouts";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "Event: SnapVibe",
  description: "Masuk booth event dan ambil strip fotomu.",
};

export default async function EventPage(props: PageProps<"/e/[slug]">) {
  const { slug } = await props.params;

  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      accessCode: events.accessCode,
      retentionHours: events.retentionHours,
    })
    .from(events)
    .where(eq(events.slug, slug))
    .limit(1);

  const event = rows[0];

  if (!event) {
    return (
      <Shell>
        <h1 className="text-display font-extrabold">Event tidak ditemukan</h1>
        <p className="mt-4 max-w-[var(--measure)] text-lead text-ink-body">
          Tautan event ini tidak dikenali. Minta organizer memeriksa kembali
          link yang dibagikan.
        </p>
        <Link
          href="/"
          className="pressable mt-8 inline-flex items-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-mint px-7 py-4 font-display text-lead font-extrabold text-ink shadow-lift-2 hover:bg-butter"
        >
          Kembali ke beranda
        </Link>
      </Shell>
    );
  }

  const eventFrames = await db
    .select({ id: frames.id, name: frames.name })
    .from(frames)
    .where(eq(frames.eventId, event.id));

  const locked = Boolean(event.accessCode);

  return (
      <Shell>
        <h1 className="text-display font-extrabold">{event.title}</h1>
        <p className="mt-5 max-w-[var(--measure)] text-lead text-ink-body">
          {locked
            ? "Masukkan kode dari organizer untuk membuka booth event ini."
            : "Booth event ini terbuka untuk semua orang. Pilih layout lalu mulai jepret."}
        </p>

        <div className="mt-10">
          {locked ? (
            <EventJoinClient slug={slug} />
          ) : (
            <Link
              href={`/booth?event=${event.id}&from=e/${encodeURIComponent(slug)}`}
              className="pressable inline-flex items-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-pink px-8 py-4 font-display text-lead font-extrabold text-ink shadow-lift-2 hover:bg-[var(--mix-coral)]"
            >
              <IconCamera size={24} stroke={2.5} aria-hidden="true" />
              Masuk booth
            </Link>
          )}
        </div>

        <dl className="mt-14 grid gap-4 sm:grid-cols-3">
          <div className="rounded-[var(--radius-lg)] border-2 border-ink bg-butter p-5 shadow-lift-2">
            <dt className="font-display text-label font-extrabold tracking-[0.12em] text-ink uppercase">
              Retensi
            </dt>
            <dd className="mt-1 font-display text-h3 font-extrabold text-ink">
              {event.retentionHours >= 24
                ? `${Math.round(event.retentionHours / 24)} hari`
                : `${event.retentionHours} jam`}
            </dd>
          </div>
          <div className="rounded-[var(--radius-lg)] border-2 border-ink bg-mint p-5 shadow-lift-2">
            <dt className="font-display text-label font-extrabold tracking-[0.12em] text-ink uppercase">
              Frame
            </dt>
            <dd className="mt-1 font-semibold text-ink">
              {eventFrames.length > 0
                ? eventFrames.map((frame) => frame.name).join(", ")
                : "Default SnapVibe"}
            </dd>
          </div>
          <div className="rounded-[var(--radius-lg)] border-2 border-ink bg-sky p-5 shadow-lift-2">
            <dt className="font-display text-label font-extrabold tracking-[0.12em] text-ink uppercase">
              Layout
            </dt>
            <dd className="mt-1 font-semibold text-ink">
              {Object.values(LAYOUTS)
                .map((layout) => layout.label)
                .join(", ")}
            </dd>
          </div>
        </dl>

        <div className="mt-8 flex flex-col items-start gap-5">
          {locked && (
            <p className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border-2 border-ink bg-plum px-4 py-1.5 font-display text-label font-bold tracking-[0.12em] text-butter uppercase">
              <IconLock size={16} stroke={2.5} aria-hidden="true" />
              Event terkunci
            </p>
          )}

          <Link
            href="/"
            className="inline-flex items-center gap-2 font-display text-small font-bold text-ink-body transition-colors hover:text-ink"
          >
            SnapVibe
            <IconArrowRight size={16} stroke={2.5} aria-hidden="true" />
          </Link>
        </div>
      </Shell>

  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b-2 border-ink">
        <div className="shell flex h-18 items-center justify-between py-2">
          <Link href="/" className="font-display text-h3 font-extrabold">
            <Logo className="h-12 w-auto" />
          </Link>
          <span className="rounded-[var(--radius-pill)] border-2 border-ink bg-sky px-4 py-1.5 font-display text-label font-bold tracking-[0.12em] text-ink uppercase">
            Booth event
          </span>
        </div>
      </header>

      <main className="flex-1">
        <div className="shell py-[var(--section)]">{children}</div>
      </main>
    </div>
  );
}
