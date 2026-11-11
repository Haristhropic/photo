"use client";

import { IconExternalLink, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AdminEventTable, type EventRow } from "@/components/admin-event-table";
import {
  CreateEventPanel,
  MaintenancePanel,
  UploadFramePanel,
} from "@/components/admin-forms";
import { AdminFrameTable, type FrameRow } from "@/components/admin-frame-table";
import { AdminHeader } from "@/components/admin-header";
import { AdminMetrics, AdminPanel, BTN } from "@/components/admin-ui";

export function AdminDashboard({
  events,
  frames,
  totals,
}: {
  events: EventRow[];
  frames: FrameRow[];
  totals: {
    events: number;
    frames: number;
    sessions: number;
    activeSessions: number;
    downloads: number;
  };
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const eventOptions = events.map((event) => ({
    id: event.id,
    title: event.title,
  }));

  return (
    <div className="flex flex-1 flex-col">
      <AdminHeader active="dashboard" />
      <main className="flex-1">
        <div className="shell py-[var(--page)]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-[1.5rem] leading-none font-extrabold text-ink sm:text-[2rem]">
                Dashboard
              </h1>
              <p className="mt-2 max-w-[54ch] text-small font-semibold text-ink-body">
                Kelola event, frame, dan retensi foto dari satu tempat.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a href="#buat-event" className={`${BTN.primary} lg:hidden`}>
                <IconPlus size={18} stroke={2.5} aria-hidden="true" />
                Buat event
              </a>
              <Link
                href="/gallery"
                target="_blank"
                rel="noreferrer"
                className={BTN.quiet}
              >
                <IconExternalLink size={16} stroke={2.5} aria-hidden="true" />
                Buka galeri
              </Link>
            </div>
          </div>

          <div className="mt-6">
            <AdminMetrics
              items={[
                {
                  label: "Event",
                  value: totals.events,
                  hint: `${totals.frames} frame terdaftar`,
                },
                {
                  label: "Sesi aktif",
                  value: totals.activeSessions,
                  hint: "masih dalam masa retensi",
                },
                {
                  label: "Total sesi",
                  value: totals.sessions,
                  hint: "sejak awal",
                },
                {
                  label: "Unduhan",
                  value: totals.downloads,
                  hint: "dari semua sesi",
                },
              ]}
            />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-w-0 flex-col gap-5">
              <AdminPanel
                title="Event"
                description="Cari, salin link, atau ubah event."
              >
                <AdminEventTable events={events} onChanged={refresh} />
              </AdminPanel>

              <AdminPanel
                title="Frame"
                description="Frame global dan frame yang terikat ke satu event."
              >
                <AdminFrameTable
                  frames={frames}
                  eventOptions={eventOptions}
                  onChanged={refresh}
                />
              </AdminPanel>
            </div>

            <div className="flex flex-col gap-5">
              <AdminPanel
                id="buat-event"
                title="Buat event"
                description="Satu link untuk semua tamu."
              >
                <CreateEventPanel onChanged={refresh} />
              </AdminPanel>

              <AdminPanel
                title="Unggah frame"
                description="PNG transparan, jendela foto otomatis."
              >
                <UploadFramePanel events={eventOptions} onChanged={refresh} />
              </AdminPanel>
            </div>
          </div>

          <div className="mt-5">
            <AdminPanel
              title="Maintenance"
              description="Bersihkan foto yang sudah kedaluwarsa."
            >
              <MaintenancePanel onChanged={refresh} />
            </AdminPanel>
          </div>
        </div>
      </main>
    </div>
  );
}
