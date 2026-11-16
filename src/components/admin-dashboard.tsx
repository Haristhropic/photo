"use client";

import { IconExternalLink } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { MaintenancePanel, UploadFramePanel } from "@/components/admin-forms";
import { AdminFrameTable, type FrameRow } from "@/components/admin-frame-table";
import { AdminHeader } from "@/components/admin-header";
import { AdminMetrics, AdminPanel, BTN } from "@/components/admin-ui";

export function AdminDashboard({
  frames,
  totals,
}: {
  frames: FrameRow[];
  totals: {
    frames: number;
    sessions: number;
    activeSessions: number;
    downloads: number;
  };
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

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
                Kelola frame, sesi, dan retensi foto dari satu tempat.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
                  label: "Frame",
                  value: totals.frames,
                  hint: "siap dipakai di studio",
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

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <AdminPanel
              title="Frame"
              description="Semua frame yang tampil di studio."
            >
              <AdminFrameTable frames={frames} onChanged={refresh} />
            </AdminPanel>

            <div className="flex flex-col gap-5">
              <AdminPanel
                title="Unggah frame"
                description="PNG transparan, jendela foto otomatis."
              >
                <UploadFramePanel onChanged={refresh} />
              </AdminPanel>

              <AdminPanel
                title="Maintenance"
                description="Bersihkan foto yang sudah kedaluwarsa."
              >
                <MaintenancePanel onChanged={refresh} />
              </AdminPanel>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
