import { IconChevronLeft } from "@tabler/icons-react";
import Link from "next/link";

type BackLinkProps = {
  href: string;
  /** Short, visible destination name: Booth, Event, Foto, Beranda. */
  label: string;
  /** Full accessible name. Defaults to "Kembali ke <label>". */
  ariaLabel?: string;
  className?: string;
};

/**
 * The one back affordance.
 *
 * It always points at the meaningful parent screen instead of calling
 * history.back(): a QR scan can open the result page with no previous entry,
 * and saving replaces the studio in history. The logo remains the home
 * shortcut, so a back control never has to guess what the browser remembers.
 */
export function BackLink({
  href,
  label,
  ariaLabel,
  className,
}: BackLinkProps) {
  const accessibleName = ariaLabel ?? `Kembali ke ${label.toLowerCase()}`;

  return (
    <Link
      href={href}
      aria-label={accessibleName}
      title={accessibleName}
      className={`pressable inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-pill)] border-2 border-ink bg-elev px-3.5 py-1.5 font-display text-label font-bold tracking-[0.1em] text-ink uppercase shadow-lift-1 hover:bg-butter ${className ?? ""}`}
    >
      <IconChevronLeft size={18} stroke={2.5} aria-hidden="true" />
      <span className="sr-only sm:not-sr-only">{label}</span>
    </Link>
  );
}
