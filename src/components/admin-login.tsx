"use client";

import { IconLock } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? "Login gagal");
      }

      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Login gagal");
      setBusy(false);
    }
  }

  return (
    <main className="shell flex flex-1 flex-col items-center justify-center py-[var(--section)]">
      <div className="w-full max-w-[var(--measure)] rounded-[var(--radius-xl)] border-2 border-ink bg-butter p-8 shadow-lift-3 sm:p-10">
        <span className="inline-flex rounded-[var(--radius-pill)] border-2 border-ink bg-ink px-4 py-1.5 font-display text-label font-extrabold tracking-[0.12em] text-butter uppercase">
          Admin
        </span>
        <h1 className="mt-6 text-display font-extrabold text-ink">
          Masuk dashboard
        </h1>
        <p className="mt-4 text-lead text-ink-body">
          Dashboard untuk membuat event, mengunggah frame, dan memantau jumlah
          foto.
        </p>

        <form onSubmit={submit} className="mt-10 flex flex-col gap-5">
          <div>
            <label
              htmlFor="admin-email"
              className="font-display text-label font-extrabold tracking-[0.12em] text-ink-meta uppercase"
            >
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-[var(--radius)] border-2 border-ink bg-elev px-4 py-3 font-semibold text-ink outline-none focus:bg-sky"
            />
          </div>

          <div>
            <label
              htmlFor="admin-password"
              className="font-display text-label font-extrabold tracking-[0.12em] text-ink-meta uppercase"
            >
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-[var(--radius)] border-2 border-ink bg-elev px-4 py-3 font-semibold text-ink outline-none focus:bg-sky"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-[var(--radius)] border-2 border-ink bg-pink px-4 py-3 font-semibold text-ink"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="pressable inline-flex items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-pink px-7 py-4 font-display text-lead font-extrabold text-ink shadow-lift-2 hover:bg-[var(--mix-coral)] disabled:opacity-45"
          >
            <IconLock size={22} stroke={2.5} aria-hidden="true" />
            {busy ? "Memeriksa..." : "Masuk"}
          </button>
        </form>
      </div>
    </main>
  );
}
