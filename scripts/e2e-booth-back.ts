import { chromium, type Page } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

function log(step: string, detail = "") {
  console.log(`[booth-back] ${step}${detail ? ` -> ${detail}` : ""}`);
}

/** Seed a finished booth run, then reload so the booth hydrates it. */
async function seedBoothRun(page: Page) {
  await page.evaluate(`(() => {
    const palette = ["#ff2020", "#20c020", "#2020ff"];
    const make = (color) => {
      const canvas = document.createElement("canvas");
      canvas.width = 900;
      canvas.height = 1200;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 900, 1200);
      return canvas.toDataURL("image/jpeg", 0.86);
    };
    sessionStorage.setItem("snapvibe.boothrun", JSON.stringify({
      layoutType: "STRIP_3",
      shots: palette.map(make),
      source: "camera",
      transforms: [],
    }));
  })()`);
}

async function openSeededBooth(page: Page, from: string) {
  await page.goto(`${BASE}/booth?from=${from}`, {
    waitUntil: "domcontentloaded",
  });
  // Let the booth hydrate and run its first pass, which clears a missing run.
  // Seeding before that pass can race with it and lose the new snapshot.
  await page
    .getByRole("heading", { name: /Pilih layout/i })
    .waitFor({ state: "visible", timeout: 20000 });
  await seedBoothRun(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("review").waitFor({
    state: "visible",
    timeout: 20000,
  });
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1024, height: 900 },
  });
  const page = await context.newPage();

  try {
    // Foto: leaving the booth for the result page confirms first.
    await openSeededBooth(page, "p/booth-back-check");
    const fotoLink = page.getByRole("link", { name: /Kembali ke foto/i });
    await fotoLink.click();
    let dialog = page.getByRole("dialog", { name: /Kembali ke foto/i });
    await dialog.waitFor({ state: "visible", timeout: 10000 });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden", timeout: 10000 });
    if (!page.url().includes("/booth?from=p/booth-back-check")) {
      throw new Error(`escape left the booth: ${page.url()}`);
    }
    log("foto", "dialog opened, Escape stayed in booth");

    await fotoLink.click();
    dialog = page.getByRole("dialog", { name: /Kembali ke foto/i });
    await dialog.getByRole("button", { name: /Batal, tetap di booth/i }).click();
    await dialog.waitFor({ state: "hidden", timeout: 10000 });
    if (!page.url().includes("/booth?from=p/booth-back-check")) {
      throw new Error(`cancel left the booth: ${page.url()}`);
    }
    log("foto", "cancel stayed in booth");

    await fotoLink.click();
    dialog = page.getByRole("dialog", { name: /Kembali ke foto/i });
    await dialog.getByRole("button", { name: /Lihat foto/i }).click();
    await page.waitForURL("**/p/booth-back-check", { timeout: 20000 });
    const runAfterFoto = await page.evaluate(() =>
      sessionStorage.getItem("snapvibe.boothrun"),
    );
    if (runAfterFoto !== null) {
      throw new Error("booth run survived the trip to the result page");
    }
    log("foto", "confirmed, booth run cleared");

    // Studio: a finished run is carried into the studio from the header.
    await openSeededBooth(page, "studio");
    const studioLink = page.getByRole("link", { name: /Kembali ke studio/i });
    await studioLink.click();
    dialog = page.getByRole("dialog", { name: /Buka studio/i });
    await dialog.waitFor({ state: "visible", timeout: 10000 });
    await dialog
      .getByRole("button", { name: /Batal, tetap di booth/i })
      .click();
    await dialog.waitFor({ state: "hidden", timeout: 10000 });
    if (!page.url().includes("/booth?from=studio")) {
      throw new Error(`studio cancel left the booth: ${page.url()}`);
    }
    log("studio", "cancel stayed in booth");

    await studioLink.click();
    dialog = page.getByRole("dialog", { name: /Buka studio/i });
    await dialog
      .getByRole("button", { name: /Bawa foto ke studio/i })
      .click();
    await page.waitForURL("**/studio", { timeout: 20000 });
    await page
      .locator('img[alt^="Pratinjau strip foto"]')
      .waitFor({ state: "visible", timeout: 25000 });
    const draft = await page.evaluate(() => {
      const raw = sessionStorage.getItem("snapvibe.draft");
      return raw ? (JSON.parse(raw) as { shots: string[]; layoutType: string }) : null;
    });
    if (!draft || draft.shots.length !== 3 || draft.layoutType !== "STRIP_3") {
      throw new Error(
        `studio did not receive the booth run: ${JSON.stringify({
          shots: draft?.shots.length,
          layoutType: draft?.layoutType,
        })}`,
      );
    }
    log("studio", "run handed to studio");

    // Layout: resetting the booth asks first.
    await openSeededBooth(page, "home");
    const layoutButton = page.getByRole("button", { name: "Ganti layout" });
    await layoutButton.click();
    dialog = page.getByRole("dialog", { name: /Ganti layout/i });
    await dialog.waitFor({ state: "visible", timeout: 10000 });
    await dialog.getByRole("button", { name: /Batal, tetap di sini/i }).click();
    await dialog.waitFor({ state: "hidden", timeout: 10000 });
    await page.getByTestId("review").waitFor({
      state: "visible",
      timeout: 10000,
    });
    log("layout", "cancel kept the shots");

    await layoutButton.click();
    dialog = page.getByRole("dialog", { name: /Ganti layout/i });
    await dialog.getByRole("button", { name: /Ganti layout/ }).click();
    await page
      .getByRole("heading", { name: /Pilih layout/i })
      .waitFor({ state: "visible", timeout: 10000 });
    if (await page.getByTestId("review").isVisible()) {
      throw new Error("review survived the layout reset");
    }
    log("layout", "confirmed, back at the layout picker");

    console.log("BOOTH_BACK_OK");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(
    "BOOTH_BACK_FAILED:",
    e instanceof Error ? e.message : e,
  );
  process.exit(1);
});
