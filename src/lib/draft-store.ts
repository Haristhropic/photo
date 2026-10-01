// The booth writes the draft and the studio reads it, but they are separate
// components that each remount on navigation. The draft therefore lives in
// sessionStorage, and this module is the single place that reads and writes it.
//
// The snapshot has to be referentially stable for useSyncExternalStore, so the
// parsed value is memoised against the raw string. Comparing the raw string
// rather than trusting a one-shot cache is what makes a second run visible: a
// module-level cache that is only invalidated after a save would keep handing
// the studio the first run's photos, or a cached null that renders as "no photo
// yet" even though the guest just shot a strip.

import { LAYOUTS, type LayoutType } from "./layouts";
import type { Draft } from "./render";

const DRAFT_KEY = "snapvibe.draft";

let cachedRaw: string | null | undefined;
let cachedDraft: Draft | null = null;

const listeners = new Set<() => void>();

/**
 * A draft is only usable when it carries every shot its layout needs. A short
 * run would otherwise render a strip with blank slots, which reads to the guest
 * as "my photo did not make it".
 */
function parse(raw: string | null): Draft | null {
  if (!raw) return null;

  let parsed: Draft;
  try {
    parsed = JSON.parse(raw) as Draft;
  } catch {
    return null;
  }

  if (!Array.isArray(parsed.shots) || parsed.shots.length === 0) return null;

  const preset = LAYOUTS[parsed.layoutType as LayoutType];
  if (!preset) return null;
  if (parsed.shots.length < preset.shotCount) return null;

  return parsed;
}

export function getDraftSnapshot(): Draft | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(DRAFT_KEY);
  } catch {
    // Storage can be blocked; treat it as "no draft yet".
    raw = null;
  }

  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedDraft = parse(raw);
  }

  return cachedDraft;
}

export function subscribeDraft(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

export function writeDraft(draft: Draft): void {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // The booth keeps the run in memory, so the studio can still be skipped.
  }
  notify();
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
  cachedRaw = undefined;
  cachedDraft = null;
  notify();
}
