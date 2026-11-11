"use client";

import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Shared controls for the admin screens. The admin keeps the product's cream
 * paper and ink borders, but reads quieter and denser than the guest flow: tasks
 * are data-heavy and repeated, so panels do the framing instead of big type.
 */

export const BTN = {
  primary:
    "pressable inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-pink px-4 py-2 font-display text-small font-extrabold text-ink shadow-lift-1 hover:bg-[var(--mix-coral)] disabled:cursor-not-allowed disabled:opacity-45",
  save:
    "pressable inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border-2 border-ink bg-mint px-3 py-1.5 font-display text-small font-bold text-ink shadow-lift-1 hover:bg-butter disabled:cursor-not-allowed disabled:opacity-45",
  quiet:
    "pressable inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border-2 border-ink bg-elev px-3 py-1.5 font-display text-small font-bold text-ink shadow-lift-1 hover:bg-butter disabled:cursor-not-allowed disabled:opacity-45",
  danger:
    "pressable inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border-2 border-ink bg-elev px-3 py-1.5 font-display text-small font-bold text-ink shadow-lift-1 hover:bg-pink disabled:cursor-not-allowed disabled:opacity-45",
  icon:
    "pressable grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] border-2 border-ink bg-elev text-ink shadow-lift-1 hover:bg-butter disabled:cursor-not-allowed disabled:opacity-45",
  iconDanger:
    "pressable grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] border-2 border-ink bg-elev text-ink shadow-lift-1 hover:bg-pink disabled:cursor-not-allowed disabled:opacity-45",
} as const;

export const FIELD =
  "mt-1.5 w-full rounded-[var(--radius-sm)] border-2 border-ink bg-elev px-3 py-2 text-small font-semibold text-ink outline-none transition-colors placeholder:text-meta/70 focus:bg-butter";

export const LABEL =
  "font-display text-[0.78rem] font-bold text-ink-body";

export const SECTION_TITLE =
  "font-display text-[1.35rem] font-extrabold leading-tight text-ink";

export function AdminPanel({
  id,
  title,
  description,
  children,
  className,
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-24 rounded-[var(--radius)] border-2 border-line-soft bg-elev ${className ?? ""}`}
    >
      <div className="border-b-2 border-line-soft bg-sunken/45 px-4 py-3">
        <h2 className="font-display text-[1.05rem] font-extrabold leading-snug text-ink">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-small font-semibold text-ink-body">
            {description}
          </p>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** A compact metric strip. Numbers stay in the display face, but small. */
export function AdminMetrics({
  items,
}: {
  items: Array<{ label: string; value: ReactNode; hint?: string }>;
}) {
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-[var(--radius)] border-2 border-line-soft bg-elev px-4 py-3"
        >
          <dt className={LABEL}>{item.label}</dt>
          <dd className="mt-1.5 font-display text-[1.6rem] leading-none font-extrabold tabular-nums text-ink">
            {item.value}
          </dd>
          {item.hint && (
            <p className="mt-1 text-small font-semibold text-meta">
              {item.hint}
            </p>
          )}
        </div>
      ))}
    </dl>
  );
}

export function AdminNotice({
  tone = "success",
  children,
}: {
  tone?: "success" | "error" | "info";
  children: ReactNode;
}) {
  const fill =
    tone === "error" ? "bg-pink" : tone === "info" ? "bg-sky" : "bg-mint";

  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-[var(--radius-sm)] border-2 border-ink ${fill} px-3 py-2 text-small font-semibold text-ink`}
    >
      {children}
    </p>
  );
}

/** The one empty state used by every admin list, so they read the same. */
export function SectionEmpty({
  title,
  hint,
  action,
}: {
  title: string;
  hint: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] border-2 border-dashed border-line-strong bg-sunken/60 px-5 py-8 text-center">
      <p className="font-display text-[1.05rem] font-extrabold text-ink">
        {title}
      </p>
      <p className="mx-auto mt-1 max-w-sm text-small font-semibold text-ink-body">
        {hint}
      </p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * Copies a link or code. The value can be a function so a client-rendered link
 * reads `window.location.origin` at click time instead of during SSR.
 */
export function CopyButton({
  value,
  label = "Salin",
  copiedLabel = "Tersalin",
  className = BTN.quiet,
  showLabel = true,
}: {
  value: string | (() => string);
  label?: string;
  copiedLabel?: string;
  className?: string;
  showLabel?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    const text = typeof value === "function" ? value() : value;
    if (!(await writeClipboard(text))) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={className}
      aria-label={copied ? copiedLabel : label}
      title={copied ? copiedLabel : label}
    >
      {copied ? (
        <IconCheck size={16} stroke={2.5} aria-hidden="true" />
      ) : (
        <IconCopy size={16} stroke={2.5} aria-hidden="true" />
      )}
      {showLabel ? (
        <span aria-live="polite">{copied ? copiedLabel : label}</span>
      ) : (
        <span className="sr-only" aria-live="polite">
          {copied ? copiedLabel : label}
        </span>
      )}
    </button>
  );
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Clipboard permission can be denied on plain http; fall through.
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Share link for an event, resolved against the current origin on click. */
export function eventLink(slug: string): string {
  return `${window.location.origin}/e/${slug}`;
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** How long until retained photos disappear, in the admin's local time. */
export function formatExpiry(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const diff = date.getTime() - Date.now();
  if (diff <= 0) return null;

  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "kurang dari 1 jam";
  if (hours < 24) return `${hours} jam lagi`;

  const days = Math.floor(hours / 24);
  if (days <= 7) return `${days} hari lagi`;

  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
