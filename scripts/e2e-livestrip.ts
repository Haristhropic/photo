import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

function log(step: string, detail = "") {
  console.log(`[livestrip] ${step}${detail ? ` -> ${detail}` : ""}`);
}

/**
 * The landing-page strip runs the real capture loop, which needs a mounted
 * <video> source to sample. When that element is missing the ref stays null,
 * no frame is ever grabbed, and every slot sits empty behind its placeholder —
 * silently, with no error. This guards the loop end to end on the real page.
 */
async function main() {
  const browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const context = await browser.newContext({
    permissions: ["camera"],
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });

    await page.waitForFunction(
      () => {
        const video = document.querySelector("video");
        return !!video && video.videoWidth > 0 && video.readyState >= 2;
      },
      undefined,
      { timeout: 20000 },
    );
    log("strip camera decoding", "readyState >= HAVE_CURRENT_DATA");

    // Frames arrive one per countdown cycle (~3s apart), so wait for the strip
    // to fill rather than sampling the moment the first slot appears.
    await page.waitForFunction(
      () =>
        document.querySelectorAll('img[alt="Bidikan yang baru saja diambil"]').length === 3,
      undefined,
      { timeout: 30000 },
    );
    const frames = page.locator('img[alt="Bidikan yang baru saja diambil"]');
    const count = await frames.count();
    log("frames captured", `${count}`);
    if (count !== 3) {
      throw new Error(`expected 3 frames in the strip, got ${count}`);
    }

    // Each slot must hold a real capture. A blank or undecoded grab comes back
    // as a flat fill, so luma spread is what separates a frame from an empty one.
    const stats = (await page.evaluate(`(() => {
      const imgs = [...document.querySelectorAll('img[alt="Bidikan yang baru saja diambil"]')];
      return Promise.all(
        imgs.map((img) =>
          new Promise((resolve) => {
            const c = document.createElement("canvas");
            c.width = 60; c.height = 80;
            const x = c.getContext("2d");
            x.drawImage(img, 0, 0, 60, 80);
            const d = x.getImageData(0, 0, 60, 80).data;
            let min = 255; let max = 0; let sum = 0;
            for (let i = 0; i < d.length; i += 4) {
              const luma = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
              min = Math.min(min, luma); max = Math.max(max, luma); sum += luma;
            }
            resolve({ mean: sum / (d.length / 4), range: max - min });
          }),
        ),
      );
    })()`)) as { mean: number; range: number }[];

    stats.forEach((s, i) => {
      log(`  frame ${i + 1} luma`, `mean=${s.mean.toFixed(1)} range=${s.range.toFixed(0)}`);
      if (s.range < 12) {
        throw new Error(
          `frame ${i + 1} looks blank or undecoded (luma range ${s.range.toFixed(0)})`,
        );
      }
    });

    console.log("LIVESTRIP_OK");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("LIVESTRIP_FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
