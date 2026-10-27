"use client";

import { IconX } from "@tabler/icons-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

type ConfirmTone = "primary" | "danger" | "neutral";

type ConfirmAction = {
  label: string;
  description?: string;
  icon: ReactNode;
  onClick: () => void;
  tone?: ConfirmTone;
};

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  icon: ReactNode;
  actions: ConfirmAction[];
  onClose: () => void;
};

const TONE_CLASS: Record<ConfirmTone, string> = {
  primary: "bg-mint hover:bg-sky",
  danger: "bg-pink hover:bg-[var(--mix-coral)]",
  neutral: "bg-elev hover:bg-butter",
};

/**
 * One modal for every "you are about to leave or reset" decision.
 *
 * It owns the shared dialog behaviour — scroll lock, Escape, backdrop close,
 * first-focus, and a Tab loop — so each caller only supplies its copy, icon,
 * and actions.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  icon,
  actions,
  onClose,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => !node.hasAttribute("disabled"));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (document.activeElement === dialogRef.current) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="w-full max-w-md rounded-[var(--radius-xl)] border-2 border-ink bg-elev p-6 shadow-lift-3 focus:outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="grid size-11 shrink-0 place-items-center rounded-[14px] border-2 border-ink bg-butter text-ink"
              aria-hidden="true"
            >
              {icon}
            </span>
            <div className="min-w-0">
              <h2
                id={titleId}
                className="font-display text-h3 font-extrabold text-ink"
              >
                {title}
              </h2>
              <p
                id={descriptionId}
                className="mt-2 text-small font-semibold text-ink-body"
              >
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog"
            className="pressable shrink-0 rounded-full p-1 hover:bg-sunken"
          >
            <IconX size={22} stroke={2.5} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-3">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className={`pressable flex w-full items-start gap-3 rounded-[var(--radius)] border-2 border-ink px-4 py-3.5 text-left shadow-lift-1 ${
                TONE_CLASS[action.tone ?? "neutral"]
              }`}
            >
              <span
                className="grid size-9 shrink-0 place-items-center rounded-[10px] border-2 border-ink bg-elev/80 text-ink"
                aria-hidden="true"
              >
                {action.icon}
              </span>
              <span className="min-w-0">
                <span className="block font-display text-label font-extrabold text-ink">
                  {action.label}
                </span>
                {action.description && (
                  <span className="mt-0.5 block text-small font-semibold text-ink-body">
                    {action.description}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
