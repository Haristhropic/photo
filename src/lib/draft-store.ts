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
//
// Storage is only a survivability layer, not the source of truth for the next
// screen. A 4K camera used to fill sessionStorage with the booth run and the
// draft, so the draft write threw, the previous run stayed in storage, and the
// studio showed the guest old photos (or no photos at all). The draft is now
// held in memory for the client-side handoff as well, and a failed write drops
// the old entry so a reload can never resurrect a previous guest's strip.

import { LAYOUTS, type LayoutType } from "./layouts";
import { normalizeShotTransform, type ShotTransform } from "./photo-transform";
import type { Draft } from "./render";

const DRAFT_KEY = "snapvibe.draft";
export const BOOTH_KEY = "snapvibe.boothrun";

let cachedRaw: string | null | undefined;
let cachedDraft: Draft | null = null;
let memoryDraft: Draft | null = null;

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

  if (
    !Array.isArray(parsed.shots) ||
    parsed.shots.length === 0 ||
    !parsed.shots.every((shot) => typeof shot === "string")
  ) {
    return null;
  }

  const preset = LAYOUTS[parsed.layoutType as LayoutType];
  if (!preset) return null;
  if (parsed.shots.length < preset.shotCount) return null;

  const source = parsed.source === "upload" ? "upload" : "camera";
  const rawTransforms = Array.isArray(parsed.transforms)
    ? parsed.transforms
    : null;
  // Old drafts have no transforms and must keep their centre-cropped look.
  // Uploaded drafts always get a sanitised entry for every slot so the renderer
  // never has to guess whether a missing index means "centre" or "broken".
  const transforms: ShotTransform[] | undefined =
    rawTransforms || source === "upload"
      ? parsed.shots.map((_, index) =>
          normalizeShotTransform(rawTransforms?.[index]),
        )
      : undefined;

  const live =
    parsed.live &&
    typeof parsed.live === "object" &&
    typeof parsed.live.runId === "string" &&
    Array.isArray(parsed.live.slots)
      ? { runId: parsed.live.runId, slots: parsed.live.slots.filter((s: any) =>
          typeof s?.slot === "number" && typeof s?.mime === "string" && typeof s?.durationMs === "number"
        ) }
      : undefined;

  return {
    shots: parsed.shots,
    layoutType: preset.type,
    eventId: typeof parsed.eventId === "string" ? parsed.eventId : null,
    source,
    ...(transforms ? { transforms } : {}),
    ...(live && live.slots.length > 0 ? { live } : {}),
  };
}

export function getDraftSnapshot(): Draft | null {
  // The in-memory draft always wins: it is the run the guest just finished,
  // even when storage was too full to keep a copy.
  if (memoryDraft) return memoryDraft;

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

/**
 * Returns whether the draft also made it into sessionStorage. The studio only
 * needs the in-memory copy for the normal client-side handoff, so callers do
 * not have to branch, but the result keeps the failure testable.
 */
export function writeDraft(draft: Draft): boolean {
  let raw: string;
  try {
    raw = JSON.stringify(draft);
  } catch {
    memoryDraft = null;
    clearStoredDraft();
    cachedRaw = undefined;
    cachedDraft = null;
    notify();
    return false;
  }

  memoryDraft = draft;

  let stored = false;
  try {
    // Drop the previous draft before writing. Otherwise a near-full quota can
    // reject the new value and leave the old photos as the only thing the
    // studio can read.
    sessionStorage.removeItem(DRAFT_KEY);
    sessionStorage.setItem(DRAFT_KEY, raw);
    stored = true;
  } catch {
    clearStoredDraft();
  }

  cachedRaw = stored ? raw : undefined;
  cachedDraft = stored ? draft : null;
  notify();
  return stored;
}

function clearStoredDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

/**
 * Hand the current draft back to the booth as its own run snapshot. The booth
 * keeps its in-progress run in sessionStorage under a separate key; without
 * this, leaving the studio drops the photos and the booth falls back to its
 * default layout, even when the guest asked to keep the draft.
 */
export function restoreDraftToBooth(draft: Draft): boolean {
  try {
    sessionStorage.setItem(
      BOOTH_KEY,
      JSON.stringify({
        layoutType: draft.layoutType,
        shots: draft.shots,
        source: draft.source,
        ...(draft.transforms ? { transforms: draft.transforms } : {}),
      }),
    );
    return true;
  } catch {
    // The studio still holds the draft in memory; the booth can be reopened
    // from there in the same tab even if storage is full.
    return false;
  }
}

export function clearBoothRun(): void {
  try {
    sessionStorage.removeItem(BOOTH_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

export function clearDraft(): void {
  memoryDraft = null;
  clearStoredDraft();
  // Discarding the draft must also stop the booth from restoring the same
  // photos through its own snapshot.
  clearBoothRun();
  cachedRaw = undefined;
  cachedDraft = null;
  notify();
}
