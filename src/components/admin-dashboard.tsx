"use client";

import { IconLogout, IconPlus, IconTrash, IconUpload } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

import { AdminEventTable, type EventRow } from "@/components/admin-event-table";
import { AdminFrameTable, type FrameRow } from "@/components/admin-frame-table";
import { Logo } from "@/components/logo";
import { LAYOUTS, LAYOUT_ORDER, type LayoutType } from "@/lib/layouts";

export function AdminDashboard({
  events,
  frames,
  totals,
}: {
  events: EventRow[];
  frames: FrameRow[];
  totals: { sessions: number; downloads: number };
}) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [retention, setRetention] = useState("24");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [frameName, setFrameName] = useState("");
  const [frameLayout, setFrameLayout] = useState<LayoutType>("STRIP_3");
  const [frameEvent, setFrameEvent] = useState("");
  const [frameFile, setFrameFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  async function createEvent(submitEvent: React.FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    if (creating) return;

    setCreating(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          accessCode: accessCode.trim() || null,
          retentionHours: Number(retention),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Gagal membuat event");

      setTitle("");
      setAccessCode("");
      setMessage(`Event dibuat: /e/${data.slug}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal membuat event");
    } finally {
      setCreating(false);
    }
  }

  async function uploadFrame(submitEvent: React.FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    if (!frameFile || uploading) return;

    setUploading(true);
    setError(null);
    setMessage(null);

    try {
      const form = new FormData();
      form.append("file", frameFile);
      form.append("name", frameName || frameFile.name.replace(/\.png$/i, ""));
      form.append("layoutType", frameLayout);
      if (frameEvent) form.append("eventId", frameEvent);

      const response = await fetch("/api/admin/frames", {
        method: "POST",
        body: form,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Gagal mengunggah frame");

      setFrameFile(null);
      setFrameName("");
      setMessage("Frame tersimpan.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal mengunggah frame");
    } finally {
      setUploading(false);
    }
  }

  async function runCleanup() {
    if (cleaning) return;
    setCleaning(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/cron/cleanup", { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Pembersihan gagal");
      setMessage(
        `${data.sessionsRemoved} sesi dihapus, ${data.filesRemoved} file dihapus.`,
      );
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pembersihan gagal");
    } finally {
      setCleaning(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b-2 border-ink">
        <div className="shell flex h-18 items-center justify-between py-2">
          <Logo className="h-11 w-auto" />
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="pressable inline-flex items-center gap-2 rounded-[var(--radius-pill)] border-2 border-ink bg-elev px-3.5 py-1.5 font-display text-label font-bold tracking-[0.1em] text-ink uppercase shadow-lift-1"
            >
              Lihat situs
            </Link>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-2 pressable inline-flex items-center gap-2 rounded-[var(--radius-pill)] border-2 border-ink bg-elev px-3.5 py-1.5 font-display text-label font-bold tracking-[0.1em] text-ink uppercase shadow-lift-1"
            >
              <IconLogout size={18} stroke={1.75} aria-hidden="true" />
              Keluar
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="shell py-[var(--section)]">
          <h1 className="text-display font-extrabold">Dashboard</h1>

          <dl className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[var(--radius-lg)] border-2 border-ink bg-elev p-6 shadow-lift-1">
              <dt className="font-display text-label font-extrabold tracking-[0.12em] text-ink-meta uppercase">
                Total sesi
              </dt>
              <dd className="mt-2 font-display text-h2 font-extrabold tabular-nums text-ink">
                {totals.sessions}
              </dd>
            </div>
            <div className="rounded-[var(--radius-lg)] border-2 border-ink bg-elev p-6 shadow-lift-1">
              <dt className="font-display text-label font-extrabold tracking-[0.12em] text-ink-meta uppercase">
                Total unduhan
              </dt>
              <dd className="mt-2 font-display text-h2 font-extrabold tabular-nums text-ink">
                {totals.downloads}
              </dd>
            </div>
          </dl>

          {message && (
            <p className="mt-6 rounded-[var(--radius)] border-2 border-ink bg-mint px-4 py-3 font-semibold text-ink">
              {message}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="mt-6 rounded-[var(--radius)] border-2 border-ink bg-pink px-4 py-3 font-semibold text-ink"
            >
              {error}
            </p>
          )}

          <section className="mt-12">
            <h2 className="font-display text-h2 font-extrabold">Buat event</h2>
            <form onSubmit={createEvent} className="mt-6 grid max-w-3xl gap-4">
              <div>
                <label htmlFor="event-title" className="font-display text-label font-extrabold tracking-[0.12em] text-ink-meta uppercase">
                  Judul
                </label>
                <input
                  id="event-title"
                  required
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-2 w-full rounded-[var(--radius)] border-2 border-ink bg-elev px-4 py-3 font-semibold text-ink outline-none focus:bg-butter"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="event-code-input" className="font-display text-label font-extrabold tracking-[0.12em] text-ink-meta uppercase">
                    Kode akses (opsional)
                  </label>
                  <input
                    id="event-code-input"
                    value={accessCode}
                    onChange={(event) => setAccessCode(event.target.value)}
                    className="mt-2 w-full rounded-[var(--radius)] border-2 border-ink bg-elev px-4 py-3 font-semibold text-ink outline-none focus:bg-butter"
                  />
                </div>
                <div>
                  <label htmlFor="event-retention" className="font-display text-label font-extrabold tracking-[0.12em] text-ink-meta uppercase">
                    Retensi (jam)
                  </label>
                  <input
                    id="event-retention"
                    type="number"
                    min={1}
                    max={720}
                    value={retention}
                    onChange={(event) => setRetention(event.target.value)}
                    className="mt-2 w-full rounded-[var(--radius)] border-2 border-ink bg-elev px-4 py-3 font-semibold text-ink outline-none focus:bg-butter"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={creating}
                className="pressable inline-flex items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-pink px-7 py-4 font-display text-lead font-extrabold text-ink shadow-lift-2 hover:bg-[var(--mix-coral)] disabled:opacity-45"
              >
                <IconPlus size={20} stroke={2.5} aria-hidden="true" />
                {creating ? "Menyimpan..." : "Buat event"}
              </button>
            </form>
          </section>

          <section className="mt-12">
            <h2 className="font-display text-h2 font-extrabold">Unggah frame</h2>
            <form onSubmit={uploadFrame} className="mt-6 grid max-w-3xl gap-4">
              <div>
                <label htmlFor="frame-file" className="font-display text-label font-extrabold tracking-[0.12em] text-ink-meta uppercase">
                  File PNG
                </label>
                <input
                  id="frame-file"
                  type="file"
                  accept="image/png"
                  required
                  onChange={(event) => setFrameFile(event.target.files?.[0] ?? null)}
                  className="mt-2 w-full rounded-[var(--radius)] border-2 border-ink bg-elev px-4 py-3 text-small font-semibold text-ink outline-none focus:bg-butter"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="frame-name" className="font-display text-label font-extrabold tracking-[0.12em] text-ink-meta uppercase">
                    Nama
                  </label>
                  <input
                    id="frame-name"
                    value={frameName}
                    onChange={(event) => setFrameName(event.target.value)}
                    className="mt-2 w-full rounded-[var(--radius)] border-2 border-ink bg-elev px-4 py-3 font-semibold text-ink outline-none focus:bg-butter"
                  />
                </div>
                <div>
                  <label htmlFor="frame-layout" className="font-display text-label font-extrabold tracking-[0.12em] text-ink-meta uppercase">
                    Layout
                  </label>
                  <select
                    id="frame-layout"
                    value={frameLayout}
                    onChange={(event) => setFrameLayout(event.target.value as LayoutType)}
                    className="mt-2 w-full rounded-[var(--radius)] border-2 border-ink bg-elev px-4 py-3 font-semibold text-ink outline-none focus:bg-butter"
                  >
                    {LAYOUT_ORDER.map((key) => (
                      <option key={key} value={key}>
                        {LAYOUTS[key].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="frame-event" className="font-display text-label font-extrabold tracking-[0.12em] text-ink-meta uppercase">
                    Event
                  </label>
                  <select
                    id="frame-event"
                    value={frameEvent}
                    onChange={(event) => setFrameEvent(event.target.value)}
                    className="mt-2 w-full rounded-[var(--radius)] border-2 border-ink bg-elev px-4 py-3 font-semibold text-ink outline-none focus:bg-butter"
                  >
                    <option value="">Tanpa event</option>
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={uploading || !frameFile}
                className="pressable inline-flex items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-elev px-6 py-3 font-display text-body font-bold text-ink shadow-lift-1 hover:bg-butter disabled:opacity-45"
              >
                <IconUpload size={20} stroke={2.5} aria-hidden="true" />
                {uploading ? "Mengunggah..." : "Unggah frame"}
              </button>
            </form>
          </section>

          <section className="mt-12">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-display text-h2 font-extrabold">Event</h2>
              <button
                type="button"
                onClick={runCleanup}
                disabled={cleaning}
                className="pressable inline-flex items-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-elev px-4 py-2 font-display text-small font-bold text-ink shadow-lift-1 hover:bg-butter disabled:opacity-45"
              >
                <IconTrash size={18} stroke={2.5} aria-hidden="true" />
                {cleaning ? "Membersihkan..." : "Jalankan retensi"}
              </button>
            </div>

            <div className="mt-6">
              <AdminEventTable events={events} onChanged={() => router.refresh()} />
            </div>
          </section>

          <section className="mt-12">
            <h2 className="font-display text-h2 font-extrabold">Frame terdaftar</h2>
            <div className="mt-6">
              <AdminFrameTable
                frames={frames}
                eventOptions={events.map((event) => ({
                  id: event.id,
                  title: event.title,
                }))}
                onChanged={() => router.refresh()}
              />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}