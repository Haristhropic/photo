import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3001";
const SHOTS_DIR = "C:/Users/Haris/AppData/Local/Temp/opencode";

function log(step: string, detail = "") {
  console.log(`[e2e] ${step}${detail ? ` -> ${detail}` : ""}`);
}

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

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

  try {
    await page.goto(`${BASE}/booth`, { waitUntil: "domcontentloaded" });
    log("booth loaded", page.url());

    const startButton = page.getByRole("button", { name: /Aktifkan kamera/i });
    await startButton.waitFor({ state: "visible", timeout: 20000 });

    // React may not have hydrated when the button first paints, which would
    // make the click a no-op. Re-click until the stream actually attaches.
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
        break;
      } catch {
        if (attempt === 6) {
          throw new Error("camera never started after 6 attempts");
        }
        log(`camera not live yet, retrying (${attempt})`);
      }
    }

    const dims = await page.evaluate(() => {
      const video = document.querySelector("video");
      return video ? `${video.videoWidth}x${video.videoHeight}` : "none";
    });
    log("camera live", dims);

    const jepret = page.getByRole("button", { name: /Jepret/i });
    await jepret.waitFor({ state: "visible", timeout: 10000 });
    await jepret.click();
    log("countdown started");

    await page
      .getByRole("button", { name: /Lanjut ke studio/i })
      .waitFor({ state: "visible", timeout: 30000 });
    const reviewShots = await page.locator('img[alt^="Bidikan"]').count();
    log("burst complete", `${reviewShots} shots captured`);
    if (reviewShots !== 3) throw new Error(`expected 3 shots, got ${reviewShots}`);

    await page.screenshot({ path: `${SHOTS_DIR}/e2e-review.png` });

    await page.getByRole("button", { name: /Lanjut ke studio/i }).click();
    await page.waitForURL("**/studio", { timeout: 15000 });
    log("studio entered", page.url());

    await page.getByRole("button", { name: "Punch" }).click();
    await page.getByRole("button", { name: "EVENT" }).click();
    log("filter + sticker applied");

    await page
      .locator('img[alt="Pratinjau strip foto"]')
      .waitFor({ state: "visible", timeout: 20000 });
    const previewSrc = await page
      .locator('img[alt="Pratinjau strip foto"]')
      .getAttribute("src");
    if (!previewSrc?.startsWith("data:image/png;base64,")) {
      throw new Error("preview is not a rendered PNG data URL");
    }
    log("preview rendered", `${Math.round(previewSrc.length / 1024)}kb data url`);
    await page.screenshot({ path: `${SHOTS_DIR}/e2e-studio.png` });

    await page.getByRole("button", { name: /Simpan dan buat QR/i }).click();
    await page.waitForURL("**/p/**", { timeout: 25000 });
    const accessKey = page.url().split("/").pop() ?? "";
    log("saved to mysql", `accessKey=${accessKey}`);

    await page.getByText("Fotomu sudah jadi").waitFor({ state: "visible", timeout: 15000 });

    const qr = page.locator('img[alt^="QR untuk"]');
    await qr.waitFor({ state: "visible", timeout: 15000 });
    const qrSrc = await qr.getAttribute("src");
    if (!qrSrc?.startsWith("data:image/png;base64,")) {
      throw new Error("QR code was not generated");
    }

    const shot = page.locator('img[alt="Strip foto hasil"]');
    await shot.waitFor({ state: "visible", timeout: 15000 });
    const shotSrc = await shot.getAttribute("src");
    log("result page", `qr=${qrSrc.length}b photo=${shotSrc}`);

    await page.screenshot({ path: `${SHOTS_DIR}/e2e-result.png`, fullPage: true });

    const download = await page.request.get(
      `${BASE}/api/sessions/${accessKey}/download`,
    );
    log("download endpoint", `${download.status()} ${download.headers()["content-disposition"] ?? ""}`);

    console.log(`\nE2E_OK accessKey=${accessKey}`);
    if (consoleErrors.length > 0) {
      console.log("CONSOLE_ERRORS:");
      for (const err of consoleErrors) console.log(`  - ${err}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("E2E_FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
