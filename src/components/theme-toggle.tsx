"use client";

import { IconMoon, IconSun } from "@tabler/icons-react";
import { useCallback, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "snapvibe-theme";

function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => "light" as Theme,
  );
  const isDark = theme === "dark";

  const toggle = useCallback(() => {
    const next: Theme = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be blocked; the attribute change still applies this visit.
    }
  }, [isDark]);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
      title={isDark ? "Mode terang" : "Mode gelap"}
      className="inline-flex size-10 items-center justify-center border border-line bg-elev text-ink transition-colors duration-150 ease-[var(--ease)] hover:border-line-strong hover:text-accent"
    >
      {isDark ? (
        <IconSun size={20} stroke={1.75} aria-hidden="true" />
      ) : (
        <IconMoon size={20} stroke={1.75} aria-hidden="true" />
      )}
    </button>
  );
}
