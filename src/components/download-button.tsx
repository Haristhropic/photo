"use client";

import { IconDownload } from "@tabler/icons-react";
import { useCallback, useState } from "react";

type DownloadButtonProps = {
  accessKey: string;
  href: string;
  initialCount: number;
};

export function DownloadButton({
  accessKey,
  href,
  initialCount,
}: DownloadButtonProps) {
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(
    async (event: React.MouseEvent<HTMLAnchorElement>) => {
      // Let the browser handle anything that is not a plain left click, so
      // middle-click and "open in new tab" keep working.
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      event.preventDefault();
      setBusy(true);
      setError(null);

      try {
        const response = await fetch(href, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(
            response.status === 410
              ? "Foto ini sudah kedaluwarsa."
              : "Foto gagal diunduh.",
          );
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = `snapvibe-${accessKey}.png`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        // Revoking straight away can abort the save while the browser is still
        // reading the blob, so the URL is released on a delay instead.
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);

        const reported = response.headers.get("x-download-count");
        if (reported !== null) {
          const next = Number.parseInt(reported, 10);
          if (Number.isFinite(next)) setCount(next);
        } else {
          setCount((value) => value + 1);
        }
      } catch {
        // Hand the download back to the browser rather than losing the file.
        window.location.href = href;
      } finally {
        setBusy(false);
      }
    },
    [accessKey, href],
  );

  return (
    <>
      <a
        href={href}
        onClick={handleClick}
        aria-busy={busy}
        className="pressable inline-flex items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-ink bg-pink px-6 py-4 font-display text-lead font-extrabold text-ink shadow-lift-2 hover:bg-[var(--mix-coral)]"
      >
        <IconDownload size={22} stroke={2.5} aria-hidden="true" />
        {busy ? "Mengunduh..." : "Unduh PNG"}
      </a>
      <p
        role="status"
        className="font-display text-label font-bold tracking-[0.12em] text-ink-meta uppercase"
      >
        {count} kali diunduh
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-[var(--radius)] border-2 border-ink bg-pink px-4 py-3 text-small font-semibold text-ink"
        >
          {error}
        </p>
      )}
    </>
  );
}