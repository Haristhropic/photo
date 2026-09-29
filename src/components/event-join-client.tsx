"use client";

import { IconLock } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function EventJoinClient({ slug }: { slug: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (checking) return;

    setChecking(true);
    setError(null);

    try {
      const response = await fetch(`/api/events/${slug}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? "Kode event salah");
      }

      router.push(
        `/booth?event=${encodeURIComponent(data.eventId)}&from=e/${encodeURIComponent(slug)}`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kode event salah");
      setChecking(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-[var(--measure)]">
      <label
        htmlFor="event-code"
        className="font-display text-label font-extrabold tracking-[0.12em] text-ink-meta uppercase"
      >
        Kode event
      </label>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <input
          id="event-code"
          name="code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="Masukkan kode dari organizer"
          className="w-full rounded-[var(--radius)] border-2 border-ink bg-elev px-4 py-3 font-semibold text-ink outline-none placeholder:text-meta focus:bg-butter"
        />
        <button
          type="submit"
          disabled={checking || code.trim().length === 0}
          className="pressable inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-pink px-7 py-4 font-display text-lead font-extrabold text-ink shadow-lift-2 hover:bg-[var(--mix-coral)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <IconLock size={22} stroke={2.5} aria-hidden="true" />
          {checking ? "Memeriksa..." : "Masuk"}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-[var(--radius)] border-2 border-ink bg-pink px-4 py-3 font-semibold text-ink"
        >
          {error}
        </p>
      )}
    </form>
  );
}
