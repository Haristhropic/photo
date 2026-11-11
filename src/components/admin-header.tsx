"use client";

import {
  IconDatabase,
  IconLayoutDashboard,
  IconLogout,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Logo } from "@/components/logo";

type AdminSection = "dashboard" | "storage";

const NAV: Array<{
  href: string;
  label: string;
  section: AdminSection;
  Icon: typeof IconLayoutDashboard;
}> = [
  { href: "/admin", label: "Dashboard", section: "dashboard", Icon: IconLayoutDashboard },
  { href: "/admin/storage", label: "Storage", section: "storage", Icon: IconDatabase },
];

export function AdminHeader({ active }: { active: AdminSection }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b-2 border-ink bg-bg">
      <div className="shell flex min-h-16 items-center justify-between gap-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            aria-label="StripSnap, kembali ke beranda"
            className="shrink-0"
          >
            <Logo className="h-10 w-auto" />
          </Link>
          <span
            aria-hidden="true"
            className="hidden h-6 border-l-2 border-line-strong sm:block"
          />
          <span className="hidden font-display text-small font-bold text-meta sm:inline">
            Admin
          </span>
        </div>

        <div className="flex items-center gap-2">
          <nav
            aria-label="Admin"
            className="flex items-center gap-1 rounded-[var(--radius)] border-2 border-ink bg-elev p-1 shadow-lift-1"
          >
            {NAV.map(({ href, label, section, Icon }) => {
              const current = active === section;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-label={label}
                  aria-current={current ? "page" : undefined}
                  className={`pressable inline-flex min-h-9 items-center gap-2 rounded-[8px] px-2.5 font-display text-small font-extrabold text-ink sm:px-3 ${
                    current ? "bg-butter" : "hover:bg-sunken"
                  }`}
                >
                  <Icon size={18} stroke={2.4} aria-hidden="true" />
                  <span className={current ? "inline" : "hidden sm:inline"}>
                    {label}
                  </span>
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={logout}
            className="pressable inline-flex min-h-9 items-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-elev px-2.5 font-display text-small font-extrabold text-ink shadow-lift-1 hover:bg-pink sm:px-3"
          >
            <IconLogout size={18} stroke={2.4} aria-hidden="true" />
            <span className="hidden sm:inline">Keluar</span>
            <span className="sr-only sm:hidden">Keluar dari admin</span>
          </button>
        </div>
      </div>
    </header>
  );
}
