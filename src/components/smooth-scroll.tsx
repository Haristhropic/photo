"use client";

import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import "lenis/dist/lenis.css";

/**
 * Owns the app's smooth scrolling. Lenis intercepts wheel input and animates
 * window scroll, which is why globals.css no longer sets scroll-behavior.
 * Renders nothing: the Lenis instance attaches to window, so there is no reason
 * to wrap the tree in an extra client boundary.
 */
export function SmoothScroll() {
  const pathname = usePathname();
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const lenis = new Lenis({
      lerp: 0.1,
      anchors: true,
      autoResize: true,
      stopInertiaOnNavigate: true,
      respectReducedMotion: true,
    });
    lenisRef.current = lenis;

    let frame = requestAnimationFrame(function raf(time: number) {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    });

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  useEffect(() => {
    // Next resets window scroll on navigation but Lenis keeps its own animated
    // position, so the two disagree and the next page can appear stuck.
    lenisRef.current?.scrollTo(0, { immediate: true });
  }, [pathname]);

  return null;
}
