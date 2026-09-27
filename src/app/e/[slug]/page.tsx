import { eq } from "drizzle-orm";
import { IconArrowRight, IconCamera, IconLock } from "@tabler/icons-react";
import Link from "next/link";
import type { Metadata } from "next";

import { EventJoinClient } from "@/components/event-join-client";
import { db } from "@/db";
import { events, frames } from "@/db/schema";
import { LAYOUTS } from "@/lib/layouts";

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
        <h1 className="text-display font-semibold">Event tidak ditemukan</h1>
        <p className="mt-4 max-w-[var(--measure)] text-lead text-ink-body">
          Tautan event ini tidak dikenali. Minta organizer memeriksa kembali
          link yang dibagikan.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 border border-line-strong px-6 py-3 text-body font-medium text-ink transition-colors duration-150 hover:border-ink"
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
      <p className="label">Event</p>
      <h1 className="mt-5 text-display font-semibold">{event.title}</h1>
      <p className="mt-4 max-w-[var(--measure)] text-lead text-ink-body">
        {locked
          ? "Masukkan kode dari organizer untuk membuka booth event ini."
          : "Booth event ini terbuka untuk semua orang. Pilih layout lalu mulai jepret."}
      </p>

      <div className="mt-10">
        {locked ? (
          <EventJoinClient slug={slug} />
        ) : (
          <Link
            href={`/booth?event=${event.id}`}
            className="inline-flex items-center gap-2 border border-accent bg-accent px-6 py-3 text-body font-medium text-on-accent transition-colors duration-150 hover:bg-accent-hover"
          >
            <IconCamera size={20} stroke={1.75} aria-hidden="true" />
            Masuk booth
          </Link>
        )}
      </div>

      <dl className="mt-12 grid gap-px border border-line bg-line sm:grid-cols-3">
        <div className="bg-elev p-5">
          <dt className="label">Retensi</dt>
          <dd className="mt-1 text-ink-body">
            {event.retentionHours >= 24
              ? `${Math.round(event.retentionHours / 24)} hari`
              : `${event.retentionHours} jam`}
          </dd>
        </div>
        <div className="bg-elev p-5">
          <dt className="label">Frame</dt>
          <dd className="mt-1 text-ink-body">
            {eventFrames.length > 0
              ? eventFrames.map((frame) => frame.name).join(", ")
              : "Default SnapVibe"}
          </dd>
        </div>
        <div className="bg-elev p-5">
          <dt className="label">Layout</dt>
          <dd className="mt-1 text-ink-body">
            {Object.values(LAYOUTS)
              .map((layout) => layout.label)
              .join(", ")}
          </dd>
        </div>
      </dl>

      {locked && (
        <p className="mt-8 inline-flex items-center gap-2 font-mono text-label tracking-[0.16em] uppercase text-meta">
          <IconLock size={16} stroke={1.75} aria-hidden="true" />
          Event terkunci
        </p>
      )}

      <Link
        href="/"
        className="mt-8 inline-flex items-center gap-2 text-small text-ink-body transition-colors hover:text-accent"
      >
        SnapVibe
        <IconArrowRight size={16} stroke={1.75} aria-hidden="true" />
      </Link>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
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
          <span className="font-mono text-label tracking-[0.16em] uppercase text-meta">
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
