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

    // A camera run cannot be saved: handing it back to the booth would drop its
    // Live clips, so the dialog only offers discard and cancel.
    dialog = await openDialog(page);
    if ((await dialog.getByRole("button", { name: /Simpan/i }).count()) !== 0) {
      throw new Error("camera draft offered a save action");
    }
    log("camera", "no save action, as intended");

    // Discarding clears the draft and reopens the booth on the chosen frame.
    await dialog.getByRole("button", { name: /Buang foto/i }).click();
    await page.waitForURL("**/booth**", { timeout: 20000 });
    await page
      .getByRole("heading", { name: "Pilih layout" })
      .waitFor({ state: "visible", timeout: 20000 });
    const strip3Pressed = await page
      .getByRole("button", { name: /^Strip 3/ })
      .first()
      .getAttribute("aria-pressed");
    if (strip3Pressed !== "true") {
      throw new Error(`camera discard opened on the wrong frame: ${page.url()}`);
    }
    log("discard", "booth reopened on the Strip 3 layout");

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
    await dialog.getByRole("button", { name: /Simpan draft/i }).click();
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

    // Discarding an upload must keep the frame as well: the booth used to
    // reopen its default four-slot upload editor and silently replace the
    // guest's choice.
    await page.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded" });
    await seedDraft(page, {
      layoutType: "STRIP_2",
      count: 2,
      source: "upload",
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await studioReady(page);
    dialog = await openDialog(page);
    await dialog.getByRole("button", { name: /Buang foto/i }).click();
    await page.waitForURL("**/booth**", { timeout: 20000 });
    if (!page.url().includes("layout=STRIP_2")) {
      throw new Error(`discard dropped the chosen layout: ${page.url()}`);
    }
    await page
      .getByText(/0 \/ 2 foto · Strip 2/i)
      .waitFor({ state: "visible", timeout: 20000 });
    const discardSlots = await page.getByTestId(/^upload-slot-/).count();
    if (discardSlots !== 2) {
      throw new Error(`discarded booth shows ${discardSlots} slots, want 2`);
    }
    log("upload discard", "booth reopened on the chosen Strip 2 layout");

    // Saving a draft must carry the whole design back to the booth, not only
    // the photos: stickers (with their placements), frame and filter have to
    // survive a booth reload and the trip back into the studio.
    await page.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded" });
    await seedDraft(page, {
      layoutType: "STRIP_3",
      count: 3,
      source: "upload",
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await studioReady(page);

    for (const name of ["Bestie", "Party"]) {
      await page.locator(`fieldset button[title^="${name}"]`).first().click();
    }
    await page.getByRole("button", { name: "Retro", exact: true }).click();
    await page.locator('button[title^="Pita"]').first().click();
    await page.waitForTimeout(600);

    const stickerLayout = () =>
      page.$$eval("[data-sticker-id]", (nodes) =>
        nodes.map((node) => ({
          id: node.getAttribute("data-sticker-id"),
          left: node.style.left,
          top: node.style.top,
          transform: node.style.transform,
        })),
      );
    const savedLayers = await stickerLayout();
    if (savedLayers.length !== 3) {
      throw new Error(`studio shows ${savedLayers.length} sticker layers, want 3`);
    }

    dialog = await openDialog(page);
    await dialog.getByRole("button", { name: /Simpan draft/i }).click();
    await page.waitForURL("**/booth**", { timeout: 20000 });

    const run = await page.evaluate(() => {
      const raw = sessionStorage.getItem("snapvibe.boothrun");
      return raw ? JSON.parse(raw) : null;
    });
    const design = run?.design;
    if (design?.filterKey !== "retro" || design?.frameKey !== "pita") {
      throw new Error(`booth run lost the design: ${JSON.stringify(design)}`);
    }
    if (design?.stickers?.length !== 3 || !design?.stickers?.[1]?.spot) {
      throw new Error(`booth run lost a sticker: ${JSON.stringify(design?.stickers)}`);
    }

    // A reload proves the design is in storage, not a one-shot memory handoff.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .getByText(/3 \/ 3 foto · Strip 3/i)
      .waitFor({ state: "visible", timeout: 20000 });
    await page.getByRole("button", { name: /Lanjut ke studio/i }).click();
    await page.waitForURL("**/studio", { timeout: 20000 });
    await studioReady(page);
    await page.waitForTimeout(600);

    const filterPressed = await page
      .getByRole("button", { name: "Retro", exact: true })
      .getAttribute("aria-pressed");
    const framePressed = await page
      .locator('button[title^="Pita"]')
      .first()
      .getAttribute("aria-pressed");
    const chipCount = await page
      .getByRole("group", { name: "Pilih stiker", exact: true })
      .getByRole("button")
      .count();
    const restoredLayers = await stickerLayout();
    if (filterPressed !== "true") throw new Error("saved filter did not return");
    if (framePressed !== "true") throw new Error("saved frame did not return");
    if (chipCount !== 3) {
      throw new Error(`restored studio shows ${chipCount} sticker chips, want 3`);
    }
    if (JSON.stringify(restoredLayers) !== JSON.stringify(savedLayers)) {
      throw new Error(
        `sticker placements changed:\nwant ${JSON.stringify(savedLayers)}\ngot  ${JSON.stringify(restoredLayers)}`,
      );
    }
    log("design save", "filter, frame and stickers survived the round trip");

    // The custom frame editor is part of the design too: its style, colours
    // and caption must come back after a save, not reset to defaults.
    await page.locator('button[title^="Custom"]').first().click();
    const custom = page.getByTestId("custom-frame-controls");
    await custom.waitFor({ state: "visible", timeout: 10000 });
    await custom.getByRole("button", { name: "Garis", exact: true }).click();
    await custom.getByRole("button", { name: "Warna kertas Mint" }).click();
    await custom.getByRole("button", { name: "Warna aksen Biru" }).click();
    await page.locator("#custom-caption").fill("Squad 2026");
    await page.waitForTimeout(400);

    dialog = await openDialog(page);
    await dialog.getByRole("button", { name: /Simpan draft/i }).click();
    await page.waitForURL("**/booth**", { timeout: 20000 });
    await page.getByRole("button", { name: /Lanjut ke studio/i }).click();
    await page.waitForURL("**/studio", { timeout: 20000 });
    await studioReady(page);
    await page.waitForTimeout(600);

    const restoredCustom = page.getByTestId("custom-frame-controls");
    await restoredCustom.waitFor({ state: "visible", timeout: 10000 });
    const customState = {
      frame: await page
        .locator('button[title^="Custom"]')
        .first()
        .getAttribute("aria-pressed"),
      style: await restoredCustom
        .getByRole("button", { name: "Garis", exact: true })
        .getAttribute("aria-pressed"),
      paper: await restoredCustom
        .getByRole("button", { name: "Warna kertas Mint" })
        .getAttribute("aria-pressed"),
      accent: await restoredCustom
        .getByRole("button", { name: "Warna aksen Biru" })
        .getAttribute("aria-pressed"),
      caption: await page.locator("#custom-caption").inputValue(),
    };
    if (
      customState.frame !== "true" ||
      customState.style !== "true" ||
      customState.paper !== "true" ||
      customState.accent !== "true" ||
      customState.caption !== "Squad 2026"
    ) {
      throw new Error(
        `custom frame did not return: ${JSON.stringify(customState)}`,
      );
    }
    log("design save", "custom frame options survived the round trip");

    console.log("STUDIO_BACK_OK");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("STUDIO_BACK_FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
