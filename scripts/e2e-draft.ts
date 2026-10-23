import { chromium, type Browser, type Page } from "playwright";

/**
 * Regression for the booth -> studio photo handoff.
 *
 * A 4K camera used to fill sessionStorage twice (booth run + draft). The draft
 * write threw, the previous run stayed in storage, and the studio rendered the
 * guest's old strip. With no previous run it rendered "Belum ada foto" even
 * though the guest had just taken photos.
 *
 * This test uses a 4K synthetic camera, fills sessionStorage to the brim, and
 * takes a real burst. It then asserts:
 *   - captured shots are downscaled (so the run fits),
 *   - the studio shows the new run, not the seeded old strip,
 *   - a reloadable stale draft is not left behind,
 *   - the studio still has a draft when there was no previous run.
 */

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

function log(step: string, detail = "") {
  console.log(`[draft] ${step}${detail ? ` -> ${detail}` : ""}`);
}

const BIG_CAMERA = `(() => {
  const md = navigator.mediaDevices;
  if (!md) return;
  md.getUserMedia = async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 3840;
    canvas.height = 2160;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    let seed = 7;
    // Large blocks keep this cheap. A 24px mosaic meant ~14k fillRects every
    // 900ms, which starved Chromium's media pipeline and made the stream
    // intermittently never attach to the <video>. The test only needs a 4K
    // source with varied luma, not a detailed animation.
    const paint = () => {
      const size = 120;
      for (let y = 0; y < canvas.height; y += size) {
        for (let x = 0; x < canvas.width; x += size) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          ctx.fillStyle =
            "rgb(" + (seed & 255) + "," + ((seed >> 8) & 255) + "," + ((seed >> 16) & 255) + ")";
          ctx.fillRect(x, y, size, size);
        }
      }
    };
    paint();
    setInterval(paint, 2000);
    return canvas.captureStream(30);
  };
})()`;

async function clickWhenSettled(page: Page, selector: string) {
  const locator = page.locator(selector).first();
  await locator.scrollIntoViewIfNeeded({ timeout: 10000 });
  let previous = await locator.boundingBox();
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await page.waitForTimeout(100);
    const current = await locator.boundingBox();
    if (
      previous &&
      current &&
      Math.abs(previous.y - current.y) < 0.5 &&
      Math.abs(previous.x - current.x) < 0.5
    ) {
      await locator.click({ timeout: 10000 });
      return;
    }
    previous = current;
  }
  await locator.click({ timeout: 10000 });
}

type SeedResult = { oldRaw: string | null; fillBytes: number };

async function seedStorage(page: Page, withOldDraft: boolean): Promise<SeedResult> {
  const result = (await page.evaluate(`(() => {
    const make = (color) => {
      const c = document.createElement("canvas");
      c.width = 900;
      c.height = 1200;
      const x = c.getContext("2d");
      x.fillStyle = color;
      x.fillRect(0, 0, 900, 1200);
      return c.toDataURL("image/jpeg", 0.9);
    };
    const oldDraft = {
      shots: [make("#ff0000"), make("#00ff00"), make("#0000ff")],
      layoutType: "STRIP_3",
      eventId: null,
    };
    if (${withOldDraft}) {
      sessionStorage.setItem("snapvibe.draft", JSON.stringify(oldDraft));
    }

    // Fill to within a few KB of the quota. Both symptoms happened when the
    // new draft could not be written.
    let total = 0;
    const steps = [1_000_000, 100_000, 10_000, 1_000];
    outer: for (const step of steps) {
      for (let i = 0; i < 200; i += 1) {
        const next = total + step;
        try {
          sessionStorage.setItem("snapvibe.test-fill", "x".repeat(next));
          total = next;
        } catch {
          break outer;
        }
      }
    }

    return {
      oldRaw: ${withOldDraft} ? sessionStorage.getItem("snapvibe.draft") : null,
      fillBytes: total,
    };
  })()`)) as SeedResult;

  log(
    withOldDraft ? "seeded old strip + full storage" : "filled storage, no old strip",
    `${Math.round(result.fillBytes / 1024)}kb filler`,
  );
  return result;
}

async function runScenario(
  browser: Browser,
  name: string,
  withOldDraft: boolean,
): Promise<void> {
  const context = await browser.newContext({
    permissions: ["camera"],
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => log(`${name} pageerror`, error.message.slice(0, 300)));
  await page.addInitScript({ content: BIG_CAMERA });

  try {
    await page.goto(`${BASE}/booth`, { waitUntil: "domcontentloaded" });
    const seeded = await seedStorage(page, withOldDraft);

    const start = page.getByRole("button", { name: /Aktifkan kamera/i });
    await start.waitFor({ state: "visible", timeout: 20000 });

    // React may not have hydrated when the button first paints, so the first
    // click can be a no-op. A camera that fails to start (a busy fake device
    // after the previous scenario) drops into the error screen, which has its
    // own retry button. Handle both, and fail with what the page actually said.
    let cameraLive = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (await start.isVisible()) {
        await start.click({ timeout: 5000 }).catch(() => undefined);
      } else {
        const retry = page.getByRole("button", { name: /Coba lagi/i });
        if (await retry.isVisible().catch(() => false)) {
          const detail = await page
            .locator("main")
            .innerText()
            .catch(() => "");
          log(`${name} camera error`, detail.replace(/\s+/g, " ").slice(0, 200));
          await retry.click({ timeout: 5000 }).catch(() => undefined);
        }
      }
      try {
        await page.waitForFunction(
          `(() => {
            const v = document.querySelector("video");
            return !!v && v.videoWidth > 0 && v.readyState >= 2;
          })()`,
          null,
          { timeout: 5000 },
        );
        cameraLive = true;
        break;
      } catch {
        if (attempt === 7) {
          const detail = await page
            .locator("main")
            .innerText()
            .catch(() => "");
          throw new Error(
            `${name}: camera never started after 8 attempts (${detail
              .replace(/\s+/g, " ")
              .slice(0, 200)})`,
          );
        }
        log(`${name} camera not live yet`, `retry ${attempt + 1}`);
      }
    }
    if (!cameraLive) throw new Error(`${name}: camera never started`);

    await clickWhenSettled(page, 'button:has-text("Jepret")');
    const proceed = page.getByRole("button", { name: /Lanjut ke studio/i });
    await proceed.waitFor({ state: "visible", timeout: 60000 });

    const shots = (await page.evaluate(`(() => {
      return [...document.querySelectorAll('img[alt^="Bidikan"]')].map((img) => ({
        width: img.naturalWidth,
        height: img.naturalHeight,
      }));
    })()`)) as { width: number; height: number }[];

    log(
      `${name} burst`,
      shots.map((s) => `${s.width}x${s.height}`).join(", "),
    );
    if (shots.length !== 3) {
      throw new Error(`${name}: expected 3 shots, got ${shots.length}`);
    }
    if (shots.some((s) => Math.max(s.width, s.height) > 1440)) {
      throw new Error(`${name}: capture was not downscaled`);
    }

    await clickWhenSettled(page, 'button:has-text("Lanjut ke studio")');
    await page.waitForURL("**/studio", { timeout: 25000 });

    const preview = page.locator('img[alt^="Pratinjau strip foto"]');
    const empty = page.getByRole("heading", { name: /Belum ada foto/i });
    const outcome = await Promise.race([
      preview.waitFor({ state: "visible", timeout: 20000 }).then(() => "preview"),
      empty.waitFor({ state: "visible", timeout: 20000 }).then(() => "empty"),
    ]).catch(() => "timeout");

    if (outcome !== "preview") {
      throw new Error(`${name}: studio did not show the new run (got ${outcome})`);
    }

    const stats = (await page.evaluate(`(async () => {
      const img = document.querySelector('img[alt^="Pratinjau strip foto"]');
      await img.decode();
      const natural = document.createElement("canvas");
      natural.width = img.naturalWidth;
      natural.height = img.naturalHeight;
      const nx = natural.getContext("2d");
      nx.drawImage(img, 0, 0);
      // Center of the first Strip 3 slot (PAD 48, 804x552).
      const data = nx.getImageData(400, 280, 100, 100).data;
      let min = 255;
      let max = 0;
      for (let i = 0; i < data.length; i += 4) {
        const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        if (luma < min) min = luma;
        if (luma > max) max = luma;
      }
      return { range: max - min, size: img.naturalWidth + "x" + img.naturalHeight };
    })()`)) as { range: number; size: string };

    log(`${name} preview`, `size=${stats.size} luma range=${stats.range.toFixed(0)}`);
    if (stats.range < 20) {
      throw new Error(
        `${name}: studio preview is a flat fill (range ${stats.range.toFixed(0)}), not the new photos`,
      );
    }

    const stored = (await page.evaluate(`(() => ({
      raw: sessionStorage.getItem("snapvibe.draft"),
      boothKey: !!sessionStorage.getItem("snapvibe.boothrun"),
    }))()`)) as { raw: string | null; boothKey: boolean };

    if (seeded.oldRaw && stored.raw === seeded.oldRaw) {
      throw new Error(`${name}: sessionStorage still holds the previous run`);
    }
    if (stored.boothKey) {
      throw new Error(`${name}: booth run snapshot was not released`);
    }

    log(
      `${name} stored`,
      stored.raw
        ? `new draft ${Math.round(stored.raw.length / 1024)}kb`
        : "draft cleared (in-memory handoff used)",
    );
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  try {
    await runScenario(browser, "old strip", true);
    await runScenario(browser, "no old strip", false);
    console.log("DRAFT_OK");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("DRAFT_FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
