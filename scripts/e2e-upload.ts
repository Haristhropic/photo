import { chromium, type Locator, type Page } from "playwright";
import sharp from "sharp";

/**
 * Upload regression: pick photos from the gallery, crop/zoom, reorder, replace,
 * remove, choose a guest-built frame, save, and download.
 *
 * It deliberately uses real file input events instead of seeding
 * `sessionStorage`, because the import path (decode, downscale, JPEG re-encode,
 * normalised transforms) is the part that can silently break the booth.
 */

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

function log(step: string, detail = "") {
  console.log(`[upload] ${step}${detail ? ` -> ${detail}` : ""}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

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
      Math.abs(previous.x - current.x) < 0.5
    ) {
      await locator.click({ timeout: 10000 });
      return;
    }
    previous = current;
  }
  await locator.click({ timeout: 10000 });
}

async function solidJpeg(
  background: { r: number; g: number; b: number },
): Promise<Buffer> {
  return sharp({
    create: {
      width: 900,
      height: 1200,
      channels: 3,
      background,
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function waitForSlot(page: Page, index: number) {
  await page.waitForFunction(
    (slotIndex) => {
      const canvas = document.querySelector(
        `[data-testid="upload-slot-${slotIndex}"] canvas`,
      ) as HTMLCanvasElement | null;
      if (!canvas) return false;
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      const pixel = ctx.getImageData(
        Math.floor(canvas.width / 2),
        Math.floor(canvas.height / 2),
        1,
        1,
      ).data;
      return pixel[3] > 0 && pixel[0] + pixel[1] + pixel[2] > 0;
    },
    index,
    { timeout: 30000 },
  );
}

async function slotCenter(page: Page, index: number) {
  return (await page.evaluate((slotIndex) => {
    const canvas = document.querySelector(
      `[data-testid="upload-slot-${slotIndex}"] canvas`,
    ) as HTMLCanvasElement | null;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const pixel = ctx.getImageData(
      Math.floor(canvas.width / 2),
      Math.floor(canvas.height / 2),
      1,
      1,
    ).data;
    return [pixel[0], pixel[1], pixel[2]] as [number, number, number];
  }, index)) as [number, number, number] | null;
}

function near(
  pixel: [number, number, number] | null,
  target: [number, number, number],
  tolerance = 28,
) {
  return (
    pixel !== null &&
    pixel.every((value, index) => Math.abs(value - target[index]) <= tolerance)
  );
}

async function previewSrc(page: Page) {
  return page
    .locator('img[alt^="Pratinjau strip foto"]')
    .getAttribute("src");
}

async function waitForPreviewChange(page: Page, previous: string | null) {
  await page.waitForFunction(
    (oldSrc) => {
      const image = document.querySelector(
        'img[alt^="Pratinjau strip foto"]',
      ) as HTMLImageElement | null;
      return (
        !!image &&
        image.getAttribute("src") !== oldSrc &&
        image.getAttribute("aria-busy") === "false" &&
        image.naturalWidth > 0
      );
    },
    previous,
    { timeout: 30000 },
  );
}

async function previewPixel(page: Page, x: number, y: number) {
  return (await page.evaluate(
    ([sampleX, sampleY]) => {
      const image = document.querySelector(
        'img[alt^="Pratinjau strip foto"]',
      ) as HTMLImageElement | null;
      if (!image) return null;
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(image, 0, 0);
      const pixel = ctx.getImageData(sampleX, sampleY, 1, 1).data;
      return [pixel[0], pixel[1], pixel[2]] as [number, number, number];
    },
    [x, y],
  )) as [number, number, number] | null;
}

async function darkPixelsInTopMargin(page: Page) {
  return (await page.evaluate(() => {
    const image = document.querySelector(
      'img[alt^="Pratinjau strip foto"]',
    ) as HTMLImageElement | null;
    if (!image) return -1;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return -1;
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(60, 22, image.naturalWidth - 120, 26).data;
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 90 && data[i + 1] < 90 && data[i + 2] < 90) dark += 1;
    }
    return dark;
  })) as number;
}

async function waitForHydration(page: Page) {
  await page.waitForFunction(
    () => {
      const input = document.querySelector(
        '[data-testid="photo-input"]',
      ) as HTMLInputElement | null;
      return (
        !!input &&
        Object.keys(input).some((key) => key.startsWith("__reactProps$"))
      );
    },
    undefined,
    { timeout: 20000 },
  );
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

  const red = await solidJpeg({ r: 220, g: 35, b: 45 });
  const green = await solidJpeg({ r: 30, g: 175, b: 90 });
  const blue = await solidJpeg({ r: 35, g: 85, b: 220 });
  const purple = await solidJpeg({ r: 125, g: 45, b: 165 });
  const amber = await solidJpeg({ r: 245, g: 160, b: 35 });

  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    const heroUploadLinks = page.getByRole("link", { name: /Unggah foto/i });
    assert(
      (await heroUploadLinks.count()) === 0,
      "landing still has an upload CTA",
    );
    log("landing upload CTA removed");

    await page.goto(`${BASE}/booth?mode=upload`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForURL("**/booth?mode=upload", { timeout: 15000 });
    await page.locator('[data-testid="upload-editor"]').waitFor({
      state: "visible",
      timeout: 15000,
    });
    await waitForHydration(page);
    log("upload editor opened");

    const input = page.locator('[data-testid="photo-input"]');
    await input.setInputFiles([
      { name: "red.jpg", mimeType: "image/jpeg", buffer: red },
      { name: "green.jpg", mimeType: "image/jpeg", buffer: green },
      { name: "blue.jpg", mimeType: "image/jpeg", buffer: blue },
      { name: "purple.jpg", mimeType: "image/jpeg", buffer: purple },
    ]);

    await page.getByText(/4 \/ 4 foto/i).waitFor({ state: "visible", timeout: 30000 });
    await waitForSlot(page, 0);
    await waitForSlot(page, 1);
    await waitForSlot(page, 2);
    await waitForSlot(page, 3);
    log("four photos imported");

    const firstCenter = await slotCenter(page, 0);
    const secondCenter = await slotCenter(page, 1);
    const thirdCenter = await slotCenter(page, 2);
    const fourthCenter = await slotCenter(page, 3);
    assert(near(firstCenter, [220, 35, 45]), `slot 1 is ${firstCenter}`);
    assert(near(secondCenter, [30, 175, 90]), `slot 2 is ${secondCenter}`);
    assert(near(thirdCenter, [35, 85, 220]), `slot 3 is ${thirdCenter}`);
    assert(near(fourthCenter, [125, 45, 165]), `slot 4 is ${fourthCenter}`);

    // Crop/zoom: open the first slot, zoom to 2x, drag, save, then reopen to
    // prove the transform was persisted rather than only shown live.
    await page
      .locator('[data-testid="upload-slot-0"]')
      .getByRole("button", { name: "Atur" })
      .click();
    const dialog = page.locator('[data-testid="photo-cropper"]');
    await dialog.waitFor({ state: "visible", timeout: 10000 });
    await page.locator("#crop-zoom").evaluate((node) => {
      const slider = node as HTMLInputElement;
      // React patches the value setter to suppress duplicate change events, so
      // use the prototype setter before dispatching the native input event.
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(slider, "2");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.getByText("2.0x").waitFor({ state: "visible", timeout: 5000 });

    const cropCanvas = page.locator('[data-testid="crop-canvas"]');
    const box = await cropCanvas.boundingBox();
    assert(box, "crop canvas has no box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 - 40,
      box.y + box.height / 2 - 20,
      { steps: 5 },
    );
    await page.mouse.up();
    await dialog.getByRole("button", { name: /Simpan posisi/i }).click();
    await dialog.waitFor({ state: "hidden", timeout: 10000 });
    await page.waitForFunction(
      () => {
        const raw = sessionStorage.getItem("snapvibe.boothrun");
        if (!raw) return false;
        const parsed = JSON.parse(raw) as {
          transforms?: Array<{ focusX: number; focusY: number; zoom: number }>;
        };
        const transform = parsed.transforms?.[0];
        return (
          !!transform &&
          transform.zoom > 1.9 &&
          transform.focusX > 0.5 &&
          transform.focusY > 0.5
        );
      },
      undefined,
      { timeout: 10000 },
    );
    log("drag updated focus and zoom in the stored transform");

    await page
      .locator('[data-testid="upload-slot-0"]')
      .getByRole("button", { name: "Atur" })
      .click();
    await dialog.waitFor({ state: "visible", timeout: 10000 });
    await page.getByText("2.0x").waitFor({ state: "visible", timeout: 5000 });
    await dialog.getByRole("button", { name: /Tutup pengaturan foto/i }).click();
    await dialog.waitFor({ state: "hidden", timeout: 10000 });
    log("crop zoom + drag persisted");

    // Replace the second slot and verify the thumbnail actually changed.
    await page
      .locator('[data-testid="upload-slot-1"]')
      .getByRole("button", { name: "Ganti" })
      .click();
    await input.setInputFiles([
      { name: "amber.jpg", mimeType: "image/jpeg", buffer: amber },
    ]);
    await page.waitForFunction(
      () => {
        const canvas = document.querySelector(
          '[data-testid="upload-slot-1"] canvas',
        ) as HTMLCanvasElement | null;
        if (!canvas) return false;
        const ctx = canvas.getContext("2d");
        if (!ctx) return false;
        const pixel = ctx.getImageData(
          Math.floor(canvas.width / 2),
          Math.floor(canvas.height / 2),
          1,
          1,
        ).data;
        return (
          Math.abs(pixel[0] - 245) < 35 &&
          Math.abs(pixel[1] - 160) < 35 &&
          Math.abs(pixel[2] - 35) < 35
        );
      },
      undefined,
      { timeout: 30000 },
    );
    log("slot 2 replaced");

    // Reorder slots 1 and 2, then remove slot 3 and add a new one.
    const beforeSwap1 = await slotCenter(page, 0);
    const beforeSwap2 = await slotCenter(page, 1);
    await page
      .locator('[data-testid="upload-slot-0"]')
      .getByRole("button", { name: /Geser foto 1 ke kanan/i })
      .click();
    await page.waitForFunction(
      (target) => {
        const canvas = document.querySelector(
          '[data-testid="upload-slot-0"] canvas',
        ) as HTMLCanvasElement | null;
        if (!canvas) return false;
        const ctx = canvas.getContext("2d");
        if (!ctx) return false;
        const pixel = ctx.getImageData(
          Math.floor(canvas.width / 2),
          Math.floor(canvas.height / 2),
          1,
          1,
        ).data;
        return (
          Math.abs(pixel[0] - target[0]) < 30 &&
          Math.abs(pixel[1] - target[1]) < 30 &&
          Math.abs(pixel[2] - target[2]) < 30
        );
      },
      beforeSwap2 ?? [0, 0, 0],
      { timeout: 15000 },
    );
    const afterSwap1 = await slotCenter(page, 0);
    const afterSwap2 = await slotCenter(page, 1);
    assert(
      near(afterSwap1, beforeSwap2 ?? [0, 0, 0]) &&
        near(afterSwap2, beforeSwap1 ?? [0, 0, 0]),
      `reorder did not swap slots: ${afterSwap1} / ${afterSwap2}`,
    );
    log("slots reordered");

    await page
      .locator('[data-testid="upload-slot-2"]')
      .getByRole("button", { name: /Hapus foto 3/i })
      .click();
    await page
      .getByText(/3 \/ 3 foto · Strip 3/i)
      .waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("button", { name: /Tambah foto/i }).click();
    await input.setInputFiles([
      { name: "blue-2.jpg", mimeType: "image/jpeg", buffer: blue },
    ]);
    await page
      .getByText(/4 \/ 4 foto · Strip 4/i)
      .waitFor({ state: "visible", timeout: 30000 });
    await waitForSlot(page, 3);
    log("remove + add restored four photos");

    await page.getByRole("button", { name: /Lanjut ke studio/i }).click();
    await page.waitForURL("**/studio", { timeout: 20000 });
    const preview = page.locator('img[alt^="Pratinjau strip foto"]');
    await preview.waitFor({ state: "visible", timeout: 30000 });
    await page.waitForFunction(
      () => {
        const image = document.querySelector(
          'img[alt^="Pratinjau strip foto"]',
        ) as HTMLImageElement | null;
        return (
          !!image &&
          image.naturalWidth === 900 &&
          image.naturalHeight === 2400 &&
          image.getAttribute("aria-busy") === "false"
        );
      },
      undefined,
      { timeout: 30000 },
    );
    log("studio opened with uploaded draft");

    const studioBack = page
      .locator("header")
      .getByRole("button", { name: /^Foto$/ });
    await studioBack.waitFor({ state: "visible", timeout: 10000 });
    await studioBack.click();
    const backDialog = page.getByRole("dialog", {
      name: /Mau kembali ke foto/i,
    });
    await backDialog.waitFor({ state: "visible", timeout: 10000 });
    await backDialog
      .getByRole("button", { name: /Batal, tetap di studio/i })
      .click();
    await backDialog.waitFor({ state: "hidden", timeout: 10000 });
    log("studio back control", "dialog opened and cancelled");

    const custom = page.getByRole("button", { name: "Custom", exact: true });
    await clickWhenSettled(page, custom);
    const controls = page.locator('[data-testid="custom-frame-controls"]');
    await controls.waitFor({ state: "visible", timeout: 10000 });
    const customSrc = await previewSrc(page);
    await page.waitForFunction(
      () => {
        const image = document.querySelector(
          'img[alt^="Pratinjau strip foto"]',
        ) as HTMLImageElement | null;
        return (
          !!image &&
          image.alt.includes("frame Custom") &&
          image.getAttribute("aria-busy") === "false"
        );
      },
      undefined,
      { timeout: 30000 },
    );
    log("custom frame selected");

    const beforeStyle = await previewSrc(page);
    await controls.getByRole("button", { name: "Bintik" }).click();
    await waitForPreviewChange(page, beforeStyle);

    const beforePaper = await previewSrc(page);
    await controls
      .getByRole("button", { name: /Warna kertas Blush/i })
      .click();
    await waitForPreviewChange(page, beforePaper);
    const paperPixel = await previewPixel(page, 20, 46);
    assert(
      near(paperPixel, [255, 227, 239], 12),
      `custom paper is ${paperPixel}, expected blush`,
    );

    const beforeAccent = await previewSrc(page);
    await controls
      .getByRole("button", { name: /Warna aksen Biru/i })
      .click();
    await waitForPreviewChange(page, beforeAccent);

    const darkBeforeCaption = await darkPixelsInTopMargin(page);
    const beforeCaption = await previewSrc(page);
    await page.locator("#custom-caption").fill("Rina & Bayu");
    await waitForPreviewChange(page, beforeCaption);
    const darkAfterCaption = await darkPixelsInTopMargin(page);
    assert(
      darkAfterCaption > darkBeforeCaption + 80,
      `caption ink did not appear (${darkBeforeCaption} -> ${darkAfterCaption})`,
    );
    log("custom caption rendered", `${darkBeforeCaption} -> ${darkAfterCaption} dark px`);

    const beforeDate = await previewSrc(page);
    await page.getByLabel(/Tanggal hari ini/i).check();
    await waitForPreviewChange(page, beforeDate);
    log("custom date rendered");

    // The custom controls stay open while resizing, so this is the widest
    // studio state (preview + frame options + caption + date) at every width.
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(
        () =>
          document.body.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 1) {
        throw new Error(`studio custom frame overflows at ${width}px by ${overflow}px`);
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    log("studio custom frame responsive at 320/390/768/1024/1440");

    assert(customSrc !== null, "custom frame preview has no src");

    const sessionRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().includes("/api/sessions"),
      { timeout: 30000 },
    );

    const save = page.getByRole("button", { name: /Simpan dan buat QR/i });
    await save.waitFor({ state: "visible", timeout: 10000 });
    await page.waitForFunction(
      () => {
        const button = [...document.querySelectorAll("button")].find((node) =>
          /Simpan dan buat QR/i.test(node.textContent || ""),
        );
        return !!button && !(button as HTMLButtonElement).disabled;
      },
      undefined,
      { timeout: 30000 },
    );
    await clickWhenSettled(page, save);
    const request = await sessionRequest;
    const body = request.postDataBuffer();
    const headers = request.headers();
    log(
      "save request",
      `${body?.length ?? 0} bytes, ${headers["content-type"] ?? "no content-type"}`,
    );
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (body && body.length > 0) {
      assert(
        body.subarray(0, pngSignature.length).equals(pngSignature),
        "save body is not a PNG",
      );
    } else {
      // Playwright does not expose Blob bodies on a fetch request in some
      // Chromium builds. The result image below still proves the PNG path.
      log("request body", "not exposed by Playwright; checking stored file");
    }
    assert(
      headers["x-layout-type"] === "STRIP_4",
      `saved layout header is ${headers["x-layout-type"]}`,
    );
    await page.waitForURL(/\/p\/[^/]+$/, { timeout: 30000 });
    log("saved session", page.url());

    await page.getByRole("link", { name: /Unduh PNG/i }).waitFor({
      state: "visible",
      timeout: 15000,
    });
    const resultImage = page.locator('img[alt="Strip foto hasil"]');
    await resultImage.waitFor({ state: "visible", timeout: 15000 });
    const resultSrc = await resultImage.getAttribute("src");
    assert(resultSrc, "result page has no strip image");
    const resultUrl = new URL(resultSrc, BASE).toString();
    const stored = await page.request.get(resultUrl);
    assert(stored.ok(), `stored strip responded ${stored.status()}`);
    const storedBody = await stored.body();
    const storedPngSignature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    assert(
      storedBody.subarray(0, storedPngSignature.length).equals(storedPngSignature),
      "stored strip is not a PNG",
    );
    log("result page ready", `${resultSrc.slice(0, 28)} (${storedBody.length} bytes)`);

    // Starting an upload from the intro's three-slot layout must grow to Strip
    // 4 when four files arrive, instead of dropping the fourth photo.
    const upgrade = await context.newPage();
    await upgrade.goto(`${BASE}/booth`, { waitUntil: "domcontentloaded" });
    await upgrade
      .getByRole("heading", { name: "Pilih layout" })
      .waitFor({ state: "visible", timeout: 15000 });
    await waitForHydration(upgrade);
    await upgrade.getByRole("button", { name: /Unggah foto/i }).click();
    const upgradeInput = upgrade.locator('[data-testid="photo-input"]');
    await upgradeInput.setInputFiles([
      { name: "red.jpg", mimeType: "image/jpeg", buffer: red },
      { name: "green.jpg", mimeType: "image/jpeg", buffer: green },
      { name: "blue.jpg", mimeType: "image/jpeg", buffer: blue },
    ]);
    await upgrade
      .getByText(/3 \/ 3 foto/i)
      .waitFor({ state: "visible", timeout: 30000 });
    await waitForSlot(upgrade, 2);
    await upgrade.getByRole("button", { name: /Tambah foto/i }).click();
    await upgradeInput.setInputFiles([
      { name: "purple.jpg", mimeType: "image/jpeg", buffer: purple },
    ]);
    await upgrade
      .getByText(/4 \/ 4 foto · Strip 4/i)
      .waitFor({ state: "visible", timeout: 30000 });
    await waitForSlot(upgrade, 3);
    log("four photos auto-upgraded Strip 3 -> Strip 4");
    await upgrade.close();

    // Two photos must move from the default four-slot layout to Strip 2, then
    // offer only the two-photo frame set in the studio.
    const two = await context.newPage();
    // No two-window frame is seeded yet, so inject a tiny synthetic one into
    // this page's catalogue. It must appear on Strip 2 and put the second photo
    // inside its transparent bottom window.
    const twoFrameSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">' +
      '<path fill="#e11d48" fill-rule="evenodd" d="M0 0H900V1200H0Z M48 48H852V588H48Z M48 612H852V1152H48Z"/>' +
      "</svg>";
    await two.route("**/api/frames*", async (route) => {
      const response = await route.fetch();
      const payload = (await response.json()) as {
        frames?: Record<string, unknown>[];
      };
      payload.frames = [
        ...(payload.frames ?? []),
        {
          id: "00000000-0000-4000-8000-000000000002",
          name: "Dua Uji",
          imageUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(twoFrameSvg)}`,
          imageWidth: 900,
          imageHeight: 1200,
          windows: [
            { x: 48, y: 48, w: 804, h: 540 },
            { x: 48, y: 612, w: 804, h: 540 },
          ],
          layoutType: "STRIP_2",
          category: "cool",
        },
      ];
      await route.fulfill({ response, json: payload });
    });
    await two.goto(`${BASE}/booth?mode=upload`, {
      waitUntil: "domcontentloaded",
    });
    await two.locator('[data-testid="upload-editor"]').waitFor({
      state: "visible",
      timeout: 15000,
    });
    await waitForHydration(two);
    const twoInput = two.locator('[data-testid="photo-input"]');
    await twoInput.setInputFiles([
      { name: "red.jpg", mimeType: "image/jpeg", buffer: red },
      { name: "green.jpg", mimeType: "image/jpeg", buffer: green },
    ]);
    await two
      .getByText(/2 \/ 2 foto · Strip 2/i)
      .waitFor({ state: "visible", timeout: 30000 });
    await waitForSlot(two, 0);
    await waitForSlot(two, 1);
    assert(
      (await two.locator('[data-testid="upload-slot-2"]').count()) === 0,
      "two-photo upload still rendered a third slot",
    );
    for (const width of [320, 390]) {
      await two.setViewportSize({ width, height: 900 });
      await two.waitForTimeout(300);
      const overflow = await two.evaluate(
        () =>
          document.body.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 1) {
        throw new Error(`two-photo editor overflows at ${width}px by ${overflow}px`);
      }
    }
    await two.setViewportSize({ width: 1440, height: 1000 });
    log("two photos selected Strip 2");

    await two.getByRole("button", { name: /Lanjut ke studio/i }).click();
    await two.waitForURL("**/studio", { timeout: 20000 });
    await two.waitForFunction(
      () => {
        const image = document.querySelector(
          'img[alt^="Pratinjau strip foto"]',
        ) as HTMLImageElement | null;
        return (
          !!image &&
          image.naturalWidth === 900 &&
          image.naturalHeight === 1200 &&
          image.getAttribute("aria-busy") === "false"
        );
      },
      undefined,
      { timeout: 30000 },
    );
    const twoNotice = two.getByText(
      /Frame event hanya muncul di layout yang sesuai/i,
    );
    await twoNotice.waitFor({ state: "visible", timeout: 15000 });
    assert(
      (await two.getByRole("button", { name: /Pita/i }).count()) > 0,
      "two-photo studio is missing the built-in frames",
    );
    assert(
      (await two.getByRole("button", { name: /Kultur/i }).count()) === 0,
      "Strip 3 frame leaked into the Strip 2 picker",
    );
    const twoFrameButton = two.getByRole("button", { name: /Dua Uji/i });
    await twoFrameButton.waitFor({ state: "visible", timeout: 15000 });
    const beforeFrame = await previewSrc(two);
    await clickWhenSettled(two, twoFrameButton);
    await waitForPreviewChange(two, beforeFrame);
    const bottomWindow = await previewPixel(two, 450, 882);
    assert(
      near(bottomWindow, [30, 175, 90], 40),
      `Strip 2 frame window is ${bottomWindow?.join(",") ?? "missing"}`,
    );
    log("two-photo studio preview is 900x1200 and fills its frame window");

    const twoSessionRequest = two.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().includes("/api/sessions"),
      { timeout: 30000 },
    );
    const twoSave = two.getByRole("button", { name: /Simpan dan buat QR/i });
    await two.waitForFunction(
      () => {
        const button = [...document.querySelectorAll("button")].find((node) =>
          /Simpan dan buat QR/i.test(node.textContent || ""),
        );
        return !!button && !(button as HTMLButtonElement).disabled;
      },
      undefined,
      { timeout: 30000 },
    );
    await clickWhenSettled(two, twoSave);
    const twoRequest = await twoSessionRequest;
    assert(
      twoRequest.headers()["x-layout-type"] === "STRIP_2",
      `two-photo save header is ${twoRequest.headers()["x-layout-type"]}`,
    );
    await two.waitForURL(/\/p\/[^/]+$/, { timeout: 30000 });
    await two.close();
    log("two-photo session saved as Strip 2");

    // Three photos must likewise leave the four-slot default and expose the
    // Strip 3 event frames.
    const three = await context.newPage();
    await three.goto(`${BASE}/booth?mode=upload`, {
      waitUntil: "domcontentloaded",
    });
    await three.locator('[data-testid="upload-editor"]').waitFor({
      state: "visible",
      timeout: 15000,
    });
    await waitForHydration(three);
    await three.locator('[data-testid="photo-input"]').setInputFiles([
      { name: "red.jpg", mimeType: "image/jpeg", buffer: red },
      { name: "green.jpg", mimeType: "image/jpeg", buffer: green },
      { name: "blue.jpg", mimeType: "image/jpeg", buffer: blue },
    ]);
    await three
      .getByText(/3 \/ 3 foto · Strip 3/i)
      .waitFor({ state: "visible", timeout: 30000 });
    await waitForSlot(three, 2);
    await three.getByRole("button", { name: /Lanjut ke studio/i }).click();
    await three.waitForURL("**/studio", { timeout: 20000 });
    await three.waitForFunction(
      () => {
        const image = document.querySelector(
          'img[alt^="Pratinjau strip foto"]',
        ) as HTMLImageElement | null;
        return (
          !!image &&
          image.naturalWidth === 900 &&
          image.naturalHeight === 1800 &&
          image.getAttribute("aria-busy") === "false"
        );
      },
      undefined,
      { timeout: 30000 },
    );
    await three
      .getByRole("button", { name: /Kultur/i })
      .waitFor({ state: "visible", timeout: 15000 });
    assert(
      (await three.getByText(/Frame event hanya muncul di layout yang sesuai/i).count()) ===
        0,
      "Strip 3 reported its own frames as hidden",
    );
    log("three-photo upload uses Strip 3 and offers its frames");
    await three.close();

    // Four photos must not steal an explicitly chosen Grid 2x2 layout: frames
    // tagged for Grid should stay available to a four-photo upload.
    const grid = await context.newPage();
    await grid.goto(`${BASE}/booth`, { waitUntil: "domcontentloaded" });
    await clickWhenSettled(
      grid,
      grid.getByRole("button", { name: /Grid 2x2/i }),
    );
    await clickWhenSettled(
      grid,
      grid.getByRole("button", { name: /^Unggah foto$/i }),
    );
    await waitForHydration(grid);
    await grid.locator('[data-testid="photo-input"]').setInputFiles([
      { name: "red.jpg", mimeType: "image/jpeg", buffer: red },
      { name: "green.jpg", mimeType: "image/jpeg", buffer: green },
      { name: "blue.jpg", mimeType: "image/jpeg", buffer: blue },
      { name: "purple.jpg", mimeType: "image/jpeg", buffer: purple },
    ]);
    await grid
      .getByText(/4 \/ 4 foto · Grid 2x2/i)
      .waitFor({ state: "visible", timeout: 30000 });
    log("four-photo upload kept an explicit Grid 2x2 layout");
    await grid.close();

    // Responsive smoke check for the filled upload editor.
    for (const width of [320, 390, 768, 1024, 1440]) {
      const responsive = await context.newPage();
      await responsive.setViewportSize({ width, height: 900 });
      await responsive.goto(`${BASE}/booth?mode=upload`, {
        waitUntil: "domcontentloaded",
      });
      await waitForHydration(responsive);
      await responsive.locator('[data-testid="photo-input"]').setInputFiles([
        { name: "red.jpg", mimeType: "image/jpeg", buffer: red },
        { name: "green.jpg", mimeType: "image/jpeg", buffer: green },
        { name: "blue.jpg", mimeType: "image/jpeg", buffer: blue },
        { name: "purple.jpg", mimeType: "image/jpeg", buffer: purple },
      ]);
      await responsive
        .getByText(/4 \/ 4 foto/i)
        .waitFor({ state: "visible", timeout: 30000 });
      await responsive.waitForTimeout(500);
      const overflow = await responsive.evaluate(
        () =>
          document.body.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 1) {
        throw new Error(`upload editor overflows at ${width}px by ${overflow}px`);
      }
      await responsive.close();
    }
    log("filled upload editor responsive at 320/390/768/1024/1440");

    if (consoleErrors.length > 0) {
      log("console errors", consoleErrors.join(" | "));
    }

    console.log("UPLOAD_OK");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("UPLOAD_FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
