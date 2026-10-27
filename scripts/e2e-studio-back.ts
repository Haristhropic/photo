import { chromium, type Page } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

function log(step: string, detail = "") {
  console.log(`[studio-back] ${step}${detail ? ` -> ${detail}` : ""}`);
}

/** Seed a complete draft, then reload so the studio reads it. */
async function seedDraft(
  page: Page,
  options: {
    layoutType: string;
    count: number;
    source?: "camera" | "upload";
  },
) {
  const payload = JSON.stringify({
    layoutType: options.layoutType,
    count: options.count,
    source: options.source ?? "camera",
    transforms:
      options.source === "upload"
        ? Array.from({ length: options.count }, () => ({
            focusX: 0.5,
            focusY: 0.5,
            zoom: 1,
          }))
        : null,
  });
  await page.evaluate(`(() => {
    const options = ${payload};
    const palette = ["#ff2020", "#20c020", "#2020ff", "#f0c020"];
    const make = (color) => {
      const canvas = document.createElement("canvas");
      canvas.width = 900;
      canvas.height = 1200;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 900, 1200);
      return canvas.toDataURL("image/jpeg", 0.86);
    };
    const shots = palette.slice(0, options.count).map(make);
    const draft = {
      shots,
      layoutType: options.layoutType,
      eventId: null,
      source: options.source,
      ...(options.transforms ? { transforms: options.transforms } : {}),
    };
    sessionStorage.setItem("snapvibe.draft", JSON.stringify(draft));
  })()`);
}

async function studioReady(page: Page) {
  await page
    .locator('img[alt^="Pratinjau strip foto"]')
    .waitFor({ state: "visible", timeout: 25000 });
}

async function openDialog(page: Page) {
  await page.getByRole("button", { name: /^(Booth|Foto)$/ }).click();
  const dialog = page.getByRole("dialog", { name: /Mau kembali/i });
  await dialog.waitFor({ state: "visible", timeout: 10000 });
  return dialog;
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1024, height: 900 },
  });
  const page = await context.newPage();

  try {
    await page.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded" });
    await seedDraft(page, { layoutType: "STRIP_3", count: 3 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await studioReady(page);
    log("seeded", "3-shot draft opened");

    // Cancel keeps the guest in the studio.
    let dialog = await openDialog(page);
    await dialog
      .getByRole("button", { name: /Batal, tetap di studio/i })
      .click();
    await dialog.waitFor({ state: "hidden", timeout: 10000 });
    if (!page.url().endsWith("/studio")) {
      throw new Error(`cancel left the studio: ${page.url()}`);
    }
    log("cancel", "stayed in studio");

    // Escape dismisses the dialog too.
    dialog = await openDialog(page);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden", timeout: 10000 });
    log("escape", "dialog dismissed");

    // Saving keeps the draft and hands it back to the booth, so the same
    // photos and three-shot layout are waiting there.
    dialog = await openDialog(page);
    await dialog.getByRole("button", { name: /Simpan ke draft/i }).click();
    await page.waitForURL("**/booth**", { timeout: 20000 });
    const review = page.getByTestId("review");
    await review.waitFor({ state: "visible", timeout: 20000 });
    const restoredShots = await page.locator('img[alt^="Bidikan"]').count();
    if (restoredShots !== 3) {
      throw new Error(
        `booth restored ${restoredShots} shots, want the saved 3`,
      );
    }
    const proceed = page.getByRole("button", { name: /Lanjut ke studio/i });
    if (await proceed.isDisabled()) {
      throw new Error("restored 3 shots do not fit the restored layout");
    }
    log("save", "booth restored 3 shots and the Strip 3 layout");

    await proceed.click();
    await page.waitForURL("**/studio", { timeout: 20000 });
    await studioReady(page);
    log("save", "draft still renders");

    // Discarding clears the draft; the studio falls back to its empty state.
    dialog = await openDialog(page);
    await dialog.getByRole("button", { name: /Buang foto/i }).click();
    await page.waitForURL("**/booth**", { timeout: 20000 });
    log("discard", "back at booth");
    await page.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: /Belum ada foto/i })
      .waitFor({ state: "visible", timeout: 20000 });
    log("discard", "draft cleared");

    // A one-photo upload is the regression that matters most: the booth used
    // to fall back to its default four-slot upload layout instead of SINGLE.
    await page.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded" });
    await seedDraft(page, {
      layoutType: "SINGLE",
      count: 1,
      source: "upload",
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await studioReady(page);
    log("upload seeded", "1-photo SINGLE draft opened");

    dialog = await openDialog(page);
    await dialog.getByRole("button", { name: /Simpan ke draft/i }).click();
    await page.waitForURL("**/booth**", { timeout: 20000 });
    if (!page.url().includes("mode=upload")) {
      throw new Error(`upload booth lost its mode: ${page.url()}`);
    }
    await page
      .getByText(/1 \/ 1 foto · Single/i)
      .waitFor({ state: "visible", timeout: 20000 });
    const singleProceed = page.getByRole("button", {
      name: /Lanjut ke studio/i,
    });
    if (await singleProceed.isDisabled()) {
      throw new Error("restored 1 photo does not fit the restored SINGLE layout");
    }
    log("upload save", "booth restored 1 photo as SINGLE");

    console.log("STUDIO_BACK_OK");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("STUDIO_BACK_FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
