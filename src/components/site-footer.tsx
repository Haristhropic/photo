import {
  IconCamera,
  IconPhoto,
  IconShieldLock,
  IconTrash,
} from "@tabler/icons-react";
import Link from "next/link";

import { Logo } from "@/components/logo";

const FOOTER_LINKS = [
  { href: "/booth", label: "Booth", icon: IconCamera },
  { href: "/gallery", label: "Galeri", icon: IconPhoto },
  { href: "/privacy", label: "Privasi", icon: IconShieldLock },
];

/** One footer for every public screen, so app and marketing pages end alike. */
export function SiteFooter() {
  return (
    <footer className="border-t-2 border-ink bg-butter">
      <div className="shell flex flex-col gap-5 py-7 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
          <Link
            href="/"
            aria-label="SnapVibe, kembali ke beranda"
            className="w-fit"
          >
            <Logo className="h-10 w-auto" />
          </Link>
          <p className="flex items-start gap-2 font-display text-label leading-[1.55] font-bold tracking-[0.12em] text-ink uppercase sm:items-center">
            <IconTrash
              size={16}
              stroke={2.5}
              aria-hidden="true"
              className="mt-0.5 shrink-0 sm:mt-0"
            />
            Foto dihapus otomatis setelah masa retensi habis
          </p>
        </div>

        <nav className="flex flex-wrap gap-2" aria-label="Footer">
          {FOOTER_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border-2 border-ink bg-elev px-4 py-1.5 font-display text-small font-bold text-ink transition-colors hover:bg-mint"
              >
                <Icon size={15} stroke={2.5} aria-hidden="true" />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </footer>
  );
}
