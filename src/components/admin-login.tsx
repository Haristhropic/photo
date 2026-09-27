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
    <main className="shell flex flex-1 flex-col justify-center py-[var(--section)]">
      <div className="max-w-[var(--measure)]">
        <p className="label">Admin</p>
        <h1 className="mt-5 text-display font-semibold">Masuk dashboard</h1>
        <p className="mt-4 text-lead text-ink-body">
          Dashboard untuk membuat event, mengunggah frame, dan memantau jumlah
          foto.
        </p>

        <form onSubmit={submit} className="mt-10 flex flex-col gap-4">
          <div>
            <label htmlFor="admin-email" className="label">
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full border border-line bg-elev px-4 py-3 text-body text-ink outline-none focus:border-accent"
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="label">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full border border-line bg-elev px-4 py-3 text-body text-ink outline-none focus:border-accent"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="border border-line bg-elev px-4 py-3 text-small"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 border border-accent bg-accent px-6 py-3 text-body font-medium text-on-accent transition-colors duration-150 hover:bg-accent-hover disabled:opacity-50"
          >
            <IconLock size={20} stroke={1.75} aria-hidden="true" />
            {busy ? "Memeriksa..." : "Masuk"}
          </button>
        </form>
      </div>
    </main>
  );
}
