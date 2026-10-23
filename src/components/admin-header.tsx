"use client";

import {
  IconDatabase,
  IconLayoutDashboard,
  IconLogout,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { BackLink } from "@/components/back-link";
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
    <header className="border-b-2 border-ink">
      <div className="shell flex h-18 items-center justify-between gap-2 py-2">
        <Link
          href="/"
          aria-label="SnapVibe, kembali ke beranda"
          className="shrink-0 font-display text-h3 font-extrabold"
        >
          <Logo className="h-11 w-auto" />
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <BackLink href="/" label="Beranda" />
          <nav className="flex items-center gap-1.5" aria-label="Admin">
            {NAV.map(({ href, label, section, Icon }) => (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active === section ? "page" : undefined}
                title={label}
                className={`pressable inline-flex size-10 items-center justify-center rounded-[var(--radius)] border-2 border-ink text-ink shadow-lift-1 ${
                  active === section ? "bg-butter" : "bg-elev hover:bg-butter"
                }`}
              >
                <Icon size={18} stroke={2.25} aria-hidden="true" />
              </Link>
            ))}
          </nav>
          <button
            type="button"
            onClick={logout}
            aria-label="Keluar dari admin"
            title="Keluar"
            className="pressable inline-flex size-10 items-center justify-center rounded-[var(--radius-pill)] border-2 border-ink bg-elev text-ink shadow-lift-1 hover:bg-pink"
          >
            <IconLogout size={18} stroke={2.25} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
