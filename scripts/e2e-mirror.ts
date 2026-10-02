import { chromium, type Page } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

function log(step: string, detail = "") {
  console.log(`[mirror] ${step}${detail ? ` -> ${detail}` : ""}`);
}

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
    // Replace the camera with a stream whose left half is red and right half is
    // blue. An unmirrored capture keeps red on the left; a mirrored one swaps
    // them, so the orientation of the saved file is unambiguous.
    await page.addInitScript(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(0, 0, 320, 480);
      ctx.fillStyle = "#0000ff";
      ctx.fillRect(320, 0, 320, 480);
      const stream = canvas.captureStream(30);
      navigator.mediaDevices.getUserMedia = () => Promise.resolve(stream);
    });

    await page.goto(`${BASE}/booth`, { waitUntil: "domcontentloaded" });

    const startButton = page.getByRole("button", { name: /Aktifkan kamera/i });
    await startButton.waitFor({ state: "visible", timeout: 20000 });
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      await startButton.click();
      try {
        await page.waitForFunction(
          () => {
            const video = document.querySelector("video");
            return !!video && video.videoWidth > 0 && video.readyState >= 2;
          },
          undefined,
          { timeout: 4000 },
        );
        break;
      } catch {
        if (attempt === 6) throw new Error("camera never became ready");
      }
    }
    log("camera live", "asymmetric test stream");

    await clickWhenSettled(page, 'button:has-text("Jepret")');
    const proceed = page.getByRole("button", { name: /Lanjut ke studio/i });
    await proceed.waitFor({ state: "visible", timeout: 40000 });
    const shotCount = await page.locator('img[alt^="Bidikan"]').count();
    if (shotCount !== 3) throw new Error(`expected 3 shots, got ${shotCount}`);
    log("burst captured", `${shotCount} shots`);

    // The review thumbnails are the raw captured frames, so they show the
    // orientation the camera actually produced.
    const review = await page.evaluate(() => {
      const img = document.querySelector(
        'img[alt^="Bidikan"]',
      ) as HTMLImageElement | null;
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 64;
      const x = c.getContext("2d");
      if (!x || !img) return { leftRed: 0, rightRed: 0 };
      x.drawImage(img, 0, 0, 64, 64);
      const left = x.getImageData(0, 0, 32, 64).data;
      const right = x.getImageData(32, 0, 32, 64).data;
      let lr = 0;
      let rr = 0;
      for (let i = 0; i < left.length; i += 4) {
        lr += left[i];
        rr += right[i];
      }
      return {
        leftRed: lr / (left.length / 4),
        rightRed: rr / (right.length / 4),
      };
    });
    log(
      "review thumbnail",
      `left red=${review.leftRed.toFixed(0)} right red=${review.rightRed.toFixed(0)}`,
    );
    if (review.leftRed <= review.rightRed) {
      throw new Error(
        `review thumbnail is mirrored: left red ${review.leftRed.toFixed(0)} should exceed right red ${review.rightRed.toFixed(0)}`,
      );
    }

    await clickWhenSettled(page, 'button:has-text("Lanjut ke studio")');
    await page.waitForURL("**/studio", { timeout: 25000 });
    await page
      .locator('img[alt="Pratinjau strip foto"]')
      .waitFor({ state: "visible", timeout: 25000 });

    const saveButton = page.getByRole("button", { name: /Simpan dan buat QR/i });
    await saveButton.waitFor({ state: "visible", timeout: 20000 });
    await saveButton.click();
    await page.waitForURL("**/p/**", { timeout: 25000 });
    const accessKey = page.url().split("/").pop() ?? "";
    log("saved", accessKey);

    // The stored file is what the guest downloads. Sample the middle of the
    // first slot: red must be on the left, blue on the right.
    const saved = await page.evaluate(async (key: string) => {
      const img = new Image();
      img.src = `/api/files/${key}.png`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const x = c.getContext("2d");
      if (!x) return { leftRed: 0, rightRed: 0 };
      x.drawImage(img, 0, 0);

      const halfWidth = Math.floor(img.naturalWidth / 2);
      const y = Math.floor(img.naturalHeight / 3 / 2);
      const left = x.getImageData(0, y, halfWidth, 1).data;
      const right = x.getImageData(halfWidth, y, halfWidth, 1).data;
      let lr = 0;
      let rr = 0;
      for (let i = 0; i < left.length; i += 4) {
        lr += left[i];
        rr += right[i];
      }
      const n = left.length / 4;
      return { leftRed: lr / n, rightRed: rr / n };
    }, accessKey);

    log(
      "stored file slot 1",
      `left red=${saved.leftRed.toFixed(0)} right red=${saved.rightRed.toFixed(0)}`,
    );
    if (saved.leftRed <= saved.rightRed) {
      throw new Error(
        `stored file is mirrored: left red ${saved.leftRed.toFixed(0)} should exceed right red ${saved.rightRed.toFixed(0)}`,
      );
    }

    console.log("MIRROR_OK");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("MIRROR_FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
