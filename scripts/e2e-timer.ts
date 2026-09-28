import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const COUNTDOWN_STEP_MS = 1000;
const COUNTDOWN_FROM = 3;
const SHOT_COUNT = 3;
const TICK_TOLERANCE_MS = 250;

type Transition = { at: number; label: string };

function log(step: string, detail = "") {
  console.log(`[timer] ${step}${detail ? ` -> ${detail}` : ""}`);
}

function assertWithin(label: string, actual: number, expected: number, tolerance: number) {
  const delta = Math.abs(actual - expected);
  if (delta > tolerance) {
    throw new Error(
      `${label}: expected ~${expected}ms, got ${Math.round(actual)}ms (off by ${Math.round(delta)}ms)`,
    );
  }
  log(label, `${Math.round(actual)}ms (target ${expected}ms)`);
}

// Source strings on purpose: tsx transpiles this file and injects esbuild's
// `__name` helper into named functions, which does not exist inside the page.
// MutationObserver rather than polling: the burst state survives only a few
// milliseconds now that each countdown grabs exactly one frame.
async function installRecorder(page: import("playwright").Page) {
  await page.evaluate(`(function () {
    var started = performance.now();
    var log = [];
    var last = "";
    function tick() {
      var countdown = document.querySelector('[data-testid="countdown"]');
      var burst = document.querySelector('[data-testid="burst"]');
      var review = document.querySelector('[data-testid="review"]');
      var label = (countdown && countdown.textContent.trim())
        || (burst ? "burst" : "")
        || (review ? "review" : "");
      if (label && label !== last) {
        last = label;
        log.push({ at: performance.now() - started, label: label });
      }
    }
    var mo = new MutationObserver(tick);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
    tick();
    window.__timer = { log: log, stop: function () { mo.disconnect(); } };
  })()`);
}

async function readRecorder(page: import("playwright").Page): Promise<Transition[]> {
  const log = await page.evaluate(`(function () {
    window.__timer.stop();
    return window.__timer.log;
  })()`);
  return log as Transition[];
}

async function startCamera(page: import("playwright").Page) {
  const startButton = page.getByRole("button", { name: /Aktifkan kamera/i });
  await startButton.waitFor({ state: "visible", timeout: 20000 });

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    await startButton.click();
    try {
      await page.waitForFunction(
        () => {
          const video = document.querySelector("video");
          return !!video && video.videoWidth > 0;
        },
        { timeout: 4000 },
      );
      return;
    } catch {
      if (attempt === 6) throw new Error("camera never started after 6 attempts");
    }
  }
}

async function lumaOf(page: import("playwright").Page, selector: string) {
  return page.locator(selector).first().evaluate(async (node) => {
    const img = node instanceof HTMLImageElement ? node : null;
    if (!img) throw new Error("not an image");
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 48;
    c.height = 36;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(img, 0, 0, 48, 36);
    const data = ctx.getImageData(0, 0, 48, 36).data;
    let sum = 0;
    let min = 255;
    let max = 0;
    for (let p = 0; p < data.length; p += 4) {
      const l = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
      sum += l;
      if (l < min) min = l;
      if (l > max) max = l;
    }
    return { mean: sum / (data.length / 4), min, max };
  });
}

async function testPerShotCountdown(browser: import("playwright").Browser) {
  const context = await browser.newContext({ permissions: ["camera"], viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/booth`, { waitUntil: "domcontentloaded" });
  await startCamera(page);
  const jepret = page.getByRole("button", { name: /Jepret/i });
  await jepret.waitFor({ state: "visible", timeout: 10000 });

  log("capture run starting");
  const startedAt = Date.now();
  await installRecorder(page);
  await jepret.click();

  await page
    .getByRole("button", { name: /Lanjut ke studio/i })
    .waitFor({ state: "visible", timeout: 40000 });
  const timeline = await readRecorder(page);
  const labels = timeline.map((t) => t.label);

  const expected: string[] = [];
  for (let shot = 0; shot < SHOT_COUNT; shot += 1) {
    expected.push("3", "2", "1", "burst");
  }
  expected.push("review");

  if (labels.join(",") !== expected.join(",")) {
    throw new Error(`wrong sequence.\n  expected: ${expected.join(" -> ")}\n  actual:   ${labels.join(" -> ")}`);
  }
  log("observed sequence", labels.join(" -> "));

  const at = (index: number) => timeline[index].at;
  for (let shot = 0; shot < SHOT_COUNT; shot += 1) {
    const base = shot * 4;
    assertWithin(`shot ${shot + 1}: 3 -> 2`, at(base + 1) - at(base), COUNTDOWN_STEP_MS, TICK_TOLERANCE_MS);
    assertWithin(`shot ${shot + 1}: 2 -> 1`, at(base + 2) - at(base + 1), COUNTDOWN_STEP_MS, TICK_TOLERANCE_MS);
    assertWithin(`shot ${shot + 1}: 1 -> snap`, at(base + 3) - at(base + 2), COUNTDOWN_STEP_MS, TICK_TOLERANCE_MS + 200);
  }

  // One full countdown per picture is the whole point: consecutive snaps must
  // be COUNTDOWN_FROM seconds apart, and the next countdown must start straight
  // away rather than after dead time.
  for (let shot = 1; shot < SHOT_COUNT; shot += 1) {
    assertWithin(
      `shot ${shot} -> shot ${shot + 1}`,
      at(shot * 4 + 3) - at(shot * 4 - 1),
      COUNTDOWN_FROM * COUNTDOWN_STEP_MS,
      TICK_TOLERANCE_MS + 250,
    );
  }

  for (let shot = 0; shot < SHOT_COUNT - 1; shot += 1) {
    const restart = at((shot + 1) * 4) - at(shot * 4 + 3);
    if (restart > 700) {
      throw new Error(`dead time after shot ${shot + 1}: ${Math.round(restart)}ms before the next countdown`);
    }
    log(`restart after shot ${shot + 1}`, `${Math.round(restart)}ms`);
  }

  const settle = at(timeline.length - 1) - at(timeline.length - 2);
  if (settle > 700) throw new Error(`review screen took ${Math.round(settle)}ms to appear after the last snap`);

  const wall = Date.now() - startedAt;
  const floor = SHOT_COUNT * COUNTDOWN_FROM * COUNTDOWN_STEP_MS;
  log("wall clock to review", `${wall}ms (floor ${floor}ms)`);
  if (wall < floor) throw new Error(`session finished in ${wall}ms, faster than ${floor}ms`);

  const shots = await page.locator('img[alt^="Bidikan"]').evaluateAll((nodes) =>
    nodes.map((n) => (n as HTMLImageElement).src),
  );
  if (shots.length !== SHOT_COUNT) throw new Error(`expected ${SHOT_COUNT} shots, got ${shots.length}`);

  for (let i = 0; i < SHOT_COUNT; i += 1) {
    const luma = await lumaOf(page, `img[alt="Bidikan ${i + 1}"]`);
    if (luma.max - luma.min < 8 || luma.mean < 8) {
      throw new Error(
        `shot ${i + 1} is blank (mean=${luma.mean.toFixed(1)} min=${luma.min} max=${luma.max}); the frame was captured after the media track stopped`,
      );
    }
    log(`shot ${i + 1} luma`, `mean=${luma.mean.toFixed(1)} range=${Math.round(luma.min)}-${Math.round(luma.max)}`);
  }

  await context.close();
}

async function testCancelDuringCountdown(browser: import("playwright").Browser) {
  const context = await browser.newContext({ permissions: ["camera"], viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/booth`, { waitUntil: "domcontentloaded" });
  await startCamera(page);
  const jepret = page.getByRole("button", { name: /Jepret/i });
  await jepret.waitFor({ state: "visible", timeout: 10000 });

  await jepret.click();
  await page.waitForSelector('[data-testid="countdown"]', { timeout: 10000 });
  log("cancelling mid-countdown");

  // Regression: the countdown loop used to keep running and drag the guest into
  // burst/review even though they had already asked to go back.
  await page.locator("header button").first().click();
  await page.getByRole("button", { name: /Aktifkan kamera/i }).waitFor({ state: "visible", timeout: 5000 });
  log("returned to layout picker");

  await page.waitForTimeout(SHOT_COUNT * COUNTDOWN_FROM * COUNTDOWN_STEP_MS + 1500);

  const stillOnPicker = await page
    .getByRole("button", { name: /Aktifkan kamera/i })
    .isVisible()
    .catch(() => false);
  const burstVisible = await page.locator('[data-testid="burst"]').isVisible().catch(() => false);
  const reviewVisible = await page.locator('[data-testid="review"]').isVisible().catch(() => false);

  if (burstVisible || reviewVisible || !stillOnPicker) {
    throw new Error(
      `cancelled run still took over (burst=${burstVisible}, review=${reviewVisible}, picker=${stillOnPicker})`,
    );
  }
  log("cancelled run stayed cancelled", "no burst, no review for the rest of the session window");

  await context.close();
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
    await testPerShotCountdown(browser);
    await testCancelDuringCountdown(browser);
    console.log("\nTIMER_OK");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("TIMER_FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
