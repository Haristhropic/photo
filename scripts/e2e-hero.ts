import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

const FILLED = '[data-slot-state="filled"]';

/** Records every `getUserMedia` call the page makes, from before any script runs. */
const INSTRUMENT_CAMERA = `
  window.__cameraCalls = 0;
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = function () {
      window.__cameraCalls += 1;
      return original.apply(null, arguments);
    };
  }
`;

const READ_CAMERA_CALLS = "window.__cameraCalls";
const COUNT_FILLED = `document.querySelectorAll('${FILLED}').length`;

function log(step: string, detail = "") {
  console.log(`[hero] ${step}${detail ? ` -> ${detail}` : ""}`);
}

/**
 * The landing-page strip is a demo of the capture cadence, not a capture.
 * It used to open the guest's camera on page load and sample real frames, so the
 * marketing page held a live feed of whoever scrolled past. This guards the new
 * contract from both sides: the strip must animate itself to three shots, and
 * the page must never reach for the camera to do it.
 */
async function main() {
  const browser = await chromium.launch();

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(INSTRUMENT_CAMERA);
    const page = await context.newPage();

    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    // Long enough to cover the boot path that used to call getUserMedia.
    await page.waitForTimeout(2000);

    const calls = (await page.evaluate(READ_CAMERA_CALLS)) as number;
    log("getUserMedia calls", `${calls}`);
    if (calls !== 0) throw new Error(`the landing page asked for the camera ${calls} time(s)`);

    const videos = await page.locator("video").count();
    log("<video> elements", `${videos}`);
    if (videos !== 0) throw new Error(`expected no <video> on the landing page, found ${videos}`);

    // Three shots land, one countdown cycle (~3s) apart.
    await page.waitForFunction(`${COUNT_FILLED} === 3`, undefined, { timeout: 25000 });
    log("strip filled", "3 shots");

    // Then it loops back to an empty strip for the next pass.
    await page.waitForFunction(`${COUNT_FILLED} === 0`, undefined, { timeout: 25000 });
    log("strip looped", "back to 0 shots");

    const loopCalls = (await page.evaluate(READ_CAMERA_CALLS)) as number;
    if (loopCalls !== 0) {
      throw new Error(`the full loop asked for the camera ${loopCalls} time(s)`);
    }

    await context.close();
    await guardReducedMotion(browser);
    console.log("HERO_STRIP_OK");
  } finally {
    await browser.close();
  }
}

/**
 * With motion reduced the strip must hold its finished state rather than run
 * timers forever — and it still must not touch the camera.
 */
async function guardReducedMotion(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(INSTRUMENT_CAMERA);
  const page = await context.newPage();

  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });

    await page.waitForFunction(`${COUNT_FILLED} === 3`, undefined, { timeout: 10000 });

    // No timers may be pending: the strip stays put instead of looping.
    await page.waitForTimeout(4000);
    const stillFilled = (await page.evaluate(COUNT_FILLED)) as number;
    const calls = (await page.evaluate(READ_CAMERA_CALLS)) as number;
    log("reduced motion", `${stillFilled} shots held, ${calls} camera calls`);
    if (stillFilled !== 3) {
      throw new Error(`reduced motion looped instead of holding (${stillFilled} shots)`);
    }
    if (calls !== 0) {
      throw new Error(`reduced motion still asked for the camera ${calls} time(s)`);
    }
  } finally {
    await context.close();
  }
}

main().catch((e) => {
  console.error("HERO_STRIP_FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
