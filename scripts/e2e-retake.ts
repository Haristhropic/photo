import { chromium, type Locator, type Page } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

function log(step: string, detail = "") {
  console.log(`[retake] ${step}${detail ? ` -> ${detail}` : ""}`);
}

/**
 * Lenis animates window scroll on its own rAF loop, so a click can land while
 * the element is still moving. Wait for the bounding box to hold still.
 */
async function clickWhenSettled(page: Page, locator: Locator) {
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

async function startCamera(page: Page) {
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

/** The studio prints the current draft's shot count and canvas size. */
async function readDraftBadge(page: Page) {
  const badge = page.getByText(/bidikan \/ \d+ x \d+/i).first();
  await badge.waitFor({ state: "visible", timeout: 20000 });
  return (await badge.textContent())?.trim() ?? "";
}

async function readPreviewSize(page: Page) {
  const preview = page.locator('img[alt="Pratinjau strip foto"]');
  await preview.waitFor({ state: "visible", timeout: 25000 });
  return preview.evaluate(async (node) => {
    const img = node as HTMLImageElement;
    await img.decode();
    return `${img.naturalWidth}x${img.naturalHeight}`;
  });
}

async function shootRun(page: Page, layoutLabel: string, expectedShots: number) {
  // The layout picker only exists in the intro state, so it has to be chosen
  // before the camera takes over the screen.
  const picker = page.getByRole("button", { name: new RegExp(layoutLabel, "i") });
  await picker.waitFor({ state: "visible", timeout: 20000 });
  await clickWhenSettled(page, picker);
  log(`layout chosen`, layoutLabel);

  await startCamera(page);
  await clickWhenSettled(page, page.getByRole("button", { name: /Jepret/i }));

  const proceed = page.getByRole("button", { name: /Lanjut ke studio/i });
  await proceed.waitFor({ state: "visible", timeout: 40000 });
  const shots = await page.locator('img[alt^="Bidikan"]').count();
  if (shots !== expectedShots) {
    throw new Error(`expected ${expectedShots} shots, got ${shots}`);
  }
  log(`run captured (${layoutLabel})`, `${shots} shots`);

  await clickWhenSettled(page, proceed);
  await page.waitForURL("**/studio", { timeout: 20000 });
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
    // Visiting the studio with nothing stored is what used to poison the cache
    // with a permanent null, so the guest's very next run rendered as "no photo
    // yet". Start here to reproduce that ordering.
    await page.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded" });
    const empty = page.getByRole("heading", { name: /Belum ada foto/i });
    await empty.waitFor({ state: "visible", timeout: 20000 });
    log("studio with no draft", "empty state shown");

    // Client-side navigation only: a full reload would reset the module and
    // hide the very bug under test.
    await clickWhenSettled(page, page.getByRole("button", { name: /Buka booth/i }));
    await page.waitForURL("**/booth**", { timeout: 20000 });

    await shootRun(page, "Strip 3", 3);
    const firstBadge = await readDraftBadge(page);
    const firstPreview = await readPreviewSize(page);
    log("first run in studio", `${firstBadge} | preview ${firstPreview}`);
    if (firstPreview !== "900x1800") {
      throw new Error(`first run preview should be 900x1800, got ${firstPreview}`);
    }

    // Retake: back to the booth, pick a different layout, shoot again. The
    // second run must replace the first everywhere in the studio.
    await clickWhenSettled(page, page.getByRole("button", { name: /Ambil ulang/i }));
    await page.waitForURL("**/booth**", { timeout: 20000 });
    log("returned to booth for a retake");

    await shootRun(page, "Grid 2x2", 4);
    const secondBadge = await readDraftBadge(page);
    const secondPreview = await readPreviewSize(page);
    log("second run in studio", `${secondBadge} | preview ${secondPreview}`);

    if (secondPreview === firstPreview) {
      throw new Error(
        `studio still renders the first run: preview is still ${secondPreview}`,
      );
    }
    if (secondPreview !== "1200x1200") {
      throw new Error(
        `second run should render the Grid 2x2 canvas 1200x1200, got ${secondPreview}`,
      );
    }
    if (secondBadge === firstBadge) {
      throw new Error(
        `studio still reports the first draft: badge is still "${secondBadge}"`,
      );
    }
    if (!/4 bidikan/i.test(secondBadge)) {
      throw new Error(`expected 4 shots in the badge, got "${secondBadge}"`);
    }

    // A third run on the original layout proves the cycle keeps working rather
    // than only alternating once.
    await clickWhenSettled(page, page.getByRole("button", { name: /Ambil ulang/i }));
    await page.waitForURL("**/booth**", { timeout: 20000 });
    await shootRun(page, "Single", 1);
    const thirdBadge = await readDraftBadge(page);
    const thirdPreview = await readPreviewSize(page);
    log("third run in studio", `${thirdBadge} | preview ${thirdPreview}`);
    if (thirdPreview !== "1000x1000") {
      throw new Error(`third run should render 1000x1000, got ${thirdPreview}`);
    }

    console.log("RETAKE_OK");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("RETAKE_FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
