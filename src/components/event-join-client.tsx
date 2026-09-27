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

      router.push(`/booth?event=${data.eventId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kode event salah");
      setChecking(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-[var(--measure)]">
      <label htmlFor="event-code" className="label">
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
          className="w-full border border-line bg-elev px-4 py-3 text-body text-ink outline-none placeholder:text-meta focus:border-accent"
        />
        <button
          type="submit"
          disabled={checking || code.trim().length === 0}
          className="inline-flex shrink-0 items-center justify-center gap-2 border border-accent bg-accent px-6 py-3 text-body font-medium text-on-accent transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconLock size={20} stroke={1.75} aria-hidden="true" />
          {checking ? "Memeriksa..." : "Masuk"}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 border border-line bg-elev px-4 py-3 text-small text-ink"
        >
          {error}
        </p>
      )}
    </form>
  );
}
