"use client";

import type Lenis from "lenis";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import "lenis/dist/lenis.css";

/**
 * Desktop-only smooth scrolling. Phones already have native momentum
 * scrolling, and loading Lenis on them costs a blocking script plus a
 * permanent rAF loop for no UX gain. The import is deferred until the main
 * thread is idle so it cannot compete with the first paint or LCP.
 */
export function SmoothScroll() {
  const pathname = usePathname();
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    if (navigator.maxTouchPoints > 0) return;
    if ((navigator.hardwareConcurrency ?? 0) < 4) return;

    let cancelled = false;
    let frame = 0;
    let remove = () => {};

    const boot = () => {
      if (cancelled) return;

      void import("lenis")
        .then(({ default: Lenis }) => {
          if (cancelled) return;

          const lenis = new Lenis({
            lerp: 0.1,
            anchors: true,
            autoResize: true,
            stopInertiaOnNavigate: true,
            respectReducedMotion: true,
          });
          lenisRef.current = lenis;

          const raf = (time: number) => {
            lenis.raf(time);
            frame = requestAnimationFrame(raf);
          };
          frame = requestAnimationFrame(raf);

          remove = () => {
            cancelAnimationFrame(frame);
            lenis.destroy();
            lenisRef.current = null;
          };
        })
        .catch(() => undefined);
    };

    let idleHandle: number | undefined;
    let timeoutHandle: number | undefined;
    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions,
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (typeof idleWindow.requestIdleCallback === "function") {
      idleHandle = idleWindow.requestIdleCallback(boot, { timeout: 2500 });
    } else {
      timeoutHandle = window.setTimeout(boot, 1500);
    }

    return () => {
      cancelled = true;
      if (idleHandle !== undefined && idleWindow.cancelIdleCallback) {
        idleWindow.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== undefined) {
        window.clearTimeout(timeoutHandle);
      }
      remove();
    };
  }, []);

  useEffect(() => {
    // Next resets window scroll on navigation but Lenis keeps its own animated
    // position, so the two disagree and the next page can appear stuck.
    lenisRef.current?.scrollTo(0, { immediate: true });
  }, [pathname]);

  return null;
}
