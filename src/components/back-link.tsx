import {
  IconCalendarEvent,
  IconCamera,
  IconHome,
  IconPalette,
  IconPhoto,
} from "@tabler/icons-react";
import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";

/** Every back pill carries the icon of the screen it returns to. Stored as
 *  rendered elements (size 18, stroke 2.5) so render only picks one up —
 *  no components are created during render. */
const BACK_ICONS: Record<string, ReactNode> = {
  Beranda: <IconHome size={18} stroke={2.5} aria-hidden="true" />,
  Booth: <IconCamera size={18} stroke={2.5} aria-hidden="true" />,
  Foto: <IconPhoto size={18} stroke={2.5} aria-hidden="true" />,
  Studio: <IconPalette size={18} stroke={2.5} aria-hidden="true" />,
  Event: <IconCalendarEvent size={18} stroke={2.5} aria-hidden="true" />,
};

/** The destination icon for a back label; shared with the studio's
 *  intercepting back button so both stay identical. */
export function backIconFor(label: string): ReactNode {
  return BACK_ICONS[label] ?? BACK_ICONS.Beranda;
}

type BackLinkProps = {
  href: string;
  /** Short, visible destination name: Booth, Event, Foto, Beranda. */
  label: string;
  /** Full accessible name. Defaults to "Kembali ke <label>". */
  ariaLabel?: string;
  className?: string;
  /** Intercept the click when the screen has unsaved work to confirm. */
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

/**
 * The one back affordance.
 *
 * It always points at the meaningful parent screen instead of calling
 * history.back(): a QR scan can open the result page with no previous entry,
 * and saving replaces the studio in history. The logo remains the home
 * shortcut, so a back control never has to guess what the browser remembers.
 */
export function BackLink({ href, label, ariaLabel, className, onClick }: BackLinkProps) {
  const accessibleName = ariaLabel ?? `Kembali ke ${label.toLowerCase()}`;

  return (
    <Link
      href={href}
      aria-label={accessibleName}
      title={accessibleName}
      onClick={onClick}
      className={`pressable inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-pill)] border-2 border-ink bg-elev px-3.5 py-1.5 font-display text-label font-bold tracking-[0.1em] text-ink uppercase shadow-lift-1 hover:bg-butter ${className ?? ""}`}
    >
      {backIconFor(label)}
      <span className="sr-only sm:not-sr-only">{label}</span>
    </Link>
  );
}
