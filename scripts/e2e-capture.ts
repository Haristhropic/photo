import { chromium, type Page } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

function log(step: string, detail = "") {
  console.log(`[capture] ${step}${detail ? ` -> ${detail}` : ""}`);
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
      Math.abs(previous.x - previous.x) < 0.5
    ) {
      await locator.click({ timeout: 10000 });
      return;
    }
    previous = current;
  }
  await locator.click({ timeout: 10000 });
}

type SavedStats = {
  w: number;
  h: number;
  slotMeans: number[][];
  range: number;
  mean: number;
};

type ShotStats = { mean: number; range: number };

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
    await page.goto(`${BASE}/booth`, { waitUntil: "domcontentloaded" });

    const startButton = page.getByRole("button", { name: /Aktifkan kamera/i });
    await startButton.waitFor({ state: "visible", timeout: 20000 });
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      await startButton.click();
      try {
        await page.waitForFunction(
          `(() => {
            const v = document.querySelector("video");
            return !!v && v.videoWidth > 0 && v.readyState >= 2;
          })()`,
          { timeout: 4000 },
        );
        break;
      } catch {
        if (attempt === 6) throw new Error("camera never became ready");
      }
    }
    log("camera live and decoding", "readyState >= HAVE_CURRENT_DATA");

    await clickWhenSettled(page, 'button:has-text("Jepret")');
    const proceed = page.getByRole("button", { name: /Lanjut ke studio/i });
    await proceed.waitFor({ state: "visible", timeout: 40000 });
    const shotCount = await page.locator('img[alt^="Bidikan"]').count();
    log("burst captured", `${shotCount} shots`);
    if (shotCount !== 3) throw new Error(`expected 3 shots, got ${shotCount}`);

    // Each review thumbnail must be a real frame with actual pixel spread. A
    // blank or not-yet-decoded grab comes back as a flat fill.
    const thumbStats = (await page.evaluate(`(() => {
      const imgs = [...document.querySelectorAll('img[alt^="Bidikan"]')];
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
    })()`)) as ShotStats[];

    thumbStats.forEach((s, i) => {
      log(`  shot ${i + 1} luma`, `mean=${s.mean.toFixed(1)} range=${s.range.toFixed(0)}`);
      if (s.range < 12) {
        throw new Error(
          `shot ${i + 1} looks blank or undecoded (luma range ${s.range.toFixed(0)})`,
        );
      }
    });

    // The three moments must differ from one another. Identical slots would
    // mean one stale frame was reused for the whole burst.
    const fingerprints = (await page.evaluate(`(() => {
      const imgs = [...document.querySelectorAll('img[alt^="Bidikan"]')];
      return Promise.all(
        imgs.map((img) =>
          new Promise((resolve) => {
            const c = document.createElement("canvas");
            c.width = 32; c.height = 32;
            const x = c.getContext("2d");
            x.drawImage(img, 0, 0, 32, 32);
            resolve([...x.getImageData(0, 0, 32, 32).data].join(","));
          }),
        ),
      );
    })()`)) as string[];

    for (let i = 0; i < fingerprints.length; i += 1) {
      for (let j = i + 1; j < fingerprints.length; j += 1) {
        if (fingerprints[i] === fingerprints[j]) {
          throw new Error(`shot ${i + 1} is pixel-identical to shot ${j + 1}`);
        }
      }
    }
    log("shots are distinct", "no two frames match");

    await clickWhenSettled(page, 'button:has-text("Lanjut ke studio")');
    await page.waitForURL("**/studio", { timeout: 25000 });
    log("studio entered");

    // The save button stays disabled until the strip has finished rendering,
    // so wait for the preview rather than racing it.
    await page
      .locator('img[alt="Pratinjau strip foto"]')
      .waitFor({ state: "visible", timeout: 25000 });

    const saveButton = page.getByRole("button", { name: /Simpan dan buat QR/i });
    await saveButton.waitFor({ state: "visible", timeout: 20000 });
    await saveButton.click();

    await page.waitForURL("**/p/**", { timeout: 25000 });
    const accessKey = page.url().split("/").pop() ?? "";
    log("saved", accessKey);

    // The stored file is what the guest actually gets back. Its three slots
    // must be three different frames, not one repeated.
    const saved = (await page.evaluate(`(async (key) => {
      const img = new Image();
      img.src = "/api/files/" + key + ".png";
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0);

      const slotMeans = [];
      const third = img.naturalHeight / 3;
      for (let i = 0; i < 3; i += 1) {
        const y = Math.floor(i * third + third / 2);
        const d = x.getImageData(0, y, img.naturalWidth, 1).data;
        let r = 0; let g = 0; let b = 0;
        for (let p = 0; p < d.length; p += 4) { r += d[p]; g += d[p + 1]; b += d[p + 2]; }
        const n = d.length / 4;
        slotMeans.push([r / n, g / n, b / n]);
      }

      let min = 255; let max = 0; let sum = 0;
      const all = x.getImageData(0, 0, img.naturalWidth, img.naturalHeight).data;
      for (let i = 0; i < all.length; i += 4) {
        const luma = 0.2126 * all[i] + 0.7152 * all[i + 1] + 0.0722 * all[i + 2];
        min = Math.min(min, luma); max = Math.max(max, luma); sum += luma;
      }
      return {
        w: img.naturalWidth,
        h: img.naturalHeight,
        slotMeans,
        range: max - min,
        mean: sum / (all.length / 4),
      };
    })(${JSON.stringify(accessKey)})`)) as SavedStats;

    log("stored file", `${saved.w}x${saved.h} luma mean=${saved.mean.toFixed(1)} range=${saved.range.toFixed(0)}`);
    if (saved.range < 12) {
      throw new Error(`stored file looks blank (luma range ${saved.range.toFixed(0)})`);
    }

    const distance = (a: number[], b: number[]) =>
      Math.sqrt(a.reduce((acc, v, i) => acc + (v - b[i]) ** 2, 0));

    for (let i = 0; i < 3; i += 1) {
      for (let j = i + 1; j < 3; j += 1) {
        const d = distance(saved.slotMeans[i], saved.slotMeans[j]);
        log(`  slot ${i + 1} vs ${j + 1}`, `distance=${d.toFixed(1)}`);
        if (d < 3) {
          throw new Error(
            `stored slots ${i + 1} and ${j + 1} are the same frame (distance ${d.toFixed(1)})`,
          );
        }
      }
    }

    console.log("CAPTURE_OK");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("CAPTURE_FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});