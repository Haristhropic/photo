import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

const HERO = '[data-hero-strip="strip-3"]';
const SLOTS = "[data-hero-slot]";

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

function log(step: string, detail = "") {
  console.log(`[hero] ${step}${detail ? ` -> ${detail}` : ""}`);
}

/**
 * The landing page shows a static proof of Strip 3. It must never ask for the
 * camera, never autoplay a video, and never advertise a live capture countdown.
 * The marketing page has no business holding a feed of whoever scrolled past
 * it. It may still mount the gallery's Live Photo players: those are recorded
 * clips with `preload="none"` that only start from a guest's tap.
 */
async function main() {
  const browser = await chromium.launch();

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(INSTRUMENT_CAMERA);
    const page = await context.newPage();
    const liveRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/gallery/live/")) liveRequests.push(request.url());
    });

    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    const calls = (await page.evaluate(READ_CAMERA_CALLS)) as number;
    log("getUserMedia calls", `${calls}`);
    if (calls !== 0) throw new Error(`the landing page asked for the camera ${calls} time(s)`);

    const media = await page.evaluate(() => {
      const hero = document.querySelector('[data-hero-strip="strip-3"]');
      const videos = [...document.querySelectorAll("video")];
      return videos.map((video) => ({
        inHero: Boolean(hero && hero.contains(video)),
        autoplay: video.hasAttribute("autoplay") || video.autoplay,
        preload: video.getAttribute("preload"),
        paused: video.paused,
        readyState: video.readyState,
      }));
    });
    log("<video> elements", `${media.length} (hero=${media.filter((v) => v.inHero).length})`);
    const badVideo = media.find(
      (video) =>
        video.inHero ||
        video.autoplay ||
        video.preload !== "none" ||
        !video.paused ||
        video.readyState !== 0,
    );
    if (badVideo) {
      throw new Error(
        `the landing page autoplays or preloads a video: ${JSON.stringify(badVideo)}`,
      );
    }
    // `currentSrc` is always populated once <video src> resolves, so the real
    // proof that nothing streams before a tap is the absence of a request.
    log("live clip requests", `${liveRequests.length}`);
    if (liveRequests.length > 0) {
      throw new Error(
        `the landing page downloaded ${liveRequests.length} live clip(s) before any tap`,
      );
    }

    await page.waitForSelector(HERO, { timeout: 10000 });

    const slots = await page.locator(`${HERO} ${SLOTS}`).count();
    log("Strip 3 slots", `${slots}`);
    if (slots !== 3) throw new Error(`expected 3 Strip 3 slots, found ${slots}`);

    const hero = page.locator(HERO);
    const heroText = await hero.innerText();
    if (!heroText.toLowerCase().includes("strip 3")) {
      throw new Error("the hero does not identify the Strip 3 layout");
    }
    if (/\bbidikan\s+\d+\s+dari\s+\d+/i.test(heroText)) {
      throw new Error("the hero still advertises a live capture countdown");
    }

    const aria = await hero.getByRole("img").getAttribute("aria-label");
    log("hero label", aria ?? "(missing)");
    if (!aria?.includes("Contoh Strip 3")) {
      throw new Error("the hero image is not labelled as a Strip 3 sample");
    }

    // A static proof must hold still; there is no loop to wait for.
    await page.waitForTimeout(2500);
    const stillThere = await page.locator(`${HERO} ${SLOTS}`).count();
    log("slots after hold", `${stillThere}`);
    if (stillThere !== 3) throw new Error(`the static strip changed to ${stillThere} slots`);

    const lateCalls = (await page.evaluate(READ_CAMERA_CALLS)) as number;
    if (lateCalls !== 0) {
      throw new Error(`the hero asked for the camera ${lateCalls} time(s) after load`);
    }

    await context.close();
    await guardReducedMotion(browser);
    console.log("HERO_STRIP_OK");
  } finally {
    await browser.close();
  }
}

/** Reduced motion still gets the same finished proof, with no camera fallback. */
async function guardReducedMotion(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(INSTRUMENT_CAMERA);
  const page = await context.newPage();

  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(BASE, { waitUntil: "networkidle" });

    await page.waitForSelector(HERO, { timeout: 10000 });
    const slots = await page.locator(`${HERO} ${SLOTS}`).count();
    const calls = (await page.evaluate(READ_CAMERA_CALLS)) as number;
    log("reduced motion", `${slots} slots, ${calls} camera calls`);
    if (slots !== 3) throw new Error(`reduced motion expected 3 slots, found ${slots}`);
    if (calls !== 0) {
      throw new Error(`reduced motion asked for the camera ${calls} time(s)`);
    }
  } finally {
    await context.close();
  }
}

main().catch((e) => {
  console.error("HERO_STRIP_FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
