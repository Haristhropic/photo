import { chromium, type Locator, type Page } from "playwright";

/**
 * Regression for the two supplied RTS event frames.
 *
 * The frames are bitmap overlays with their own transparent photo windows, so
 * they cannot use the layout's regular slot grid. This test seeds a Strip 3
 * draft, selects Kultur, and checks that all three photos land inside the
 * frame's windows (including the top edge of the second and third windows,
 * which the layout slots do not cover). It also checks that the frames are
 * hidden from the picker on a layout they were not designed for.
 */

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

function log(step: string, detail = "") {
  console.log(`[frame] ${step}${detail ? ` -> ${detail}` : ""}`);
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

/** Four solid shots, so a sampled window centre is an exact colour. */
async function seedDraft(page: Page, layoutType: string, count: number) {
  await page.evaluate(`(() => {
    const palette = ["#ff2020", "#20c020", "#2020ff", "#f0c020"];
    const make = (color) => {
      const canvas = document.createElement("canvas");
      canvas.width = 900;
      canvas.height = 1200;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 900, 1200);
      ctx.fillStyle = "#111111";
      ctx.fillRect(24, 24, 90, 24);
      return canvas.toDataURL("image/jpeg", 0.86);
    };
    const shots = palette.slice(0, ${count}).map(make);
    sessionStorage.setItem("snapvibe.draft", JSON.stringify({
      shots,
      layoutType: "${layoutType}",
      eventId: null,
    }));
  })()`);
}

type Pixel = [number, number, number];

async function readPreview(page: Page) {
  return (await page.evaluate(`(async () => {
    const img = document.querySelector('img[alt^="Pratinjau strip foto"]');
    if (!img) return null;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const sample = (x, y) => {
      const data = ctx.getImageData(Math.round(x) - 3, Math.round(y) - 3, 7, 7).data;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n += 1;
      }
      return [r / n, g / n, b / n];
    };
    const top = ctx.getImageData(0, 0, img.naturalWidth, Math.round(img.naturalHeight * 0.08)).data;
    let colored = 0;
    for (let i = 0; i < top.length; i += 4) {
      const r = top[i];
      const g = top[i + 1];
      const b = top[i + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) > 60) colored += 1;
    }
    return {
      size: img.naturalWidth + "x" + img.naturalHeight,
      one: sample(450, 350),
      two: sample(450, 812),
      three: sample(450, 1276),
      twoTop: sample(450, 618),
      threeTop: sample(450, 1100),
      coloredTop: colored,
    };
  })()`)) as {
    size: string;
    one: Pixel;
    two: Pixel;
    three: Pixel;
    twoTop: Pixel;
    threeTop: Pixel;
    coloredTop: number;
  } | null;
}

function near(pixel: Pixel, target: Pixel, tolerance = 45) {
  return pixel.every((value, index) => Math.abs(value - target[index]) <= tolerance);
}

function describe(pixel: Pixel) {
  return pixel.map((value) => Math.round(value)).join(",");
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  await page.addInitScript({
    content: "window.__name = function (f) { return f; };",
  });

  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await seedDraft(page, "STRIP_3", 3);
    await page.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded" });

    const preview = page.locator('img[alt^="Pratinjau strip foto"]');
    await preview.waitFor({ state: "visible", timeout: 30000 });
    await page.waitForFunction(
      `(() => {
        const img = document.querySelector('img[alt^="Pratinjau strip foto"]');
        return !!img && img.naturalWidth === 900 && img.naturalHeight === 1800;
      })()`,
      { timeout: 30000 },
    );

    const kultur = page.getByRole("button", { name: /Kultur/i });
    await kultur.waitFor({ state: "visible", timeout: 10000 });
    await clickWhenSettled(page, kultur);
    await page.waitForFunction(
      `(() => {
        const img = document.querySelector('img[alt^="Pratinjau strip foto"]');
        return !!img && img.alt.includes("Kultur");
      })()`,
      { timeout: 30000 },
    );

    const stats = await readPreview(page);
    if (!stats) throw new Error("Kultur preview did not render");
    log(
      "Kultur preview",
      `${stats.size} top=${describe(stats.one)} middle=${describe(stats.two)} bottom=${describe(stats.three)}`,
    );
    log(
      "window top edges",
      `${describe(stats.twoTop)} / ${describe(stats.threeTop)}`,
    );

    if (stats.size !== "900x1800") {
      throw new Error(`expected a 900x1800 Strip 3 preview, got ${stats.size}`);
    }
    if (stats.coloredTop < 500) {
      throw new Error(
        `frame artwork is missing from the preview (${stats.coloredTop} coloured pixels)`,
      );
    }
    if (!near(stats.one, [255, 32, 32]) || !near(stats.two, [32, 192, 32]) || !near(stats.three, [32, 32, 255])) {
      throw new Error(
        `photos did not land in all three frame windows: ${describe(stats.one)} / ${describe(stats.two)} / ${describe(stats.three)}`,
      );
    }
    // These points sit above the layout's second and third slots but inside
    // the bitmap frame's windows. They are white unless the renderer used the
    // frame's own window grid.
    if (!near(stats.twoTop, [32, 192, 32], 60)) {
      throw new Error(`second window top edge is not photo: ${describe(stats.twoTop)}`);
    }
    if (!near(stats.threeTop, [32, 32, 255], 60)) {
      throw new Error(`third window top edge is not photo: ${describe(stats.threeTop)}`);
    }
    log("all three bitmap windows filled");

    // Changing a sticker used to clear the valid preview immediately, swapping
    // the <img> for a differently sized "Merender" box. Keep the same element
    // mounted and its box stable while the new sticker renders.
    const sizeBefore = await preview.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    const pageHeightBefore = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    await preview.evaluate((node) => {
      (node as HTMLImageElement).dataset.sentinel = "keep";
    });
    const cakep = page.getByRole("button", { name: /Cakep/i });
    await cakep.waitFor({ state: "visible", timeout: 10000 });
    await clickWhenSettled(page, cakep);
    await page.waitForFunction(
      `(() => {
        const img = document.querySelector('img[alt^="Pratinjau strip foto"]');
        return !!img && img.alt.includes("Cakep");
      })()`,
      { timeout: 30000 },
    );
    const stable = await preview.evaluate((node) => {
      const img = node as HTMLImageElement;
      const rect = img.getBoundingClientRect();
      return {
        sentinel: img.dataset.sentinel,
        width: rect.width,
        height: rect.height,
      };
    });
    const pageHeightAfter = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    log(
      "sticker preview",
      `${stable.width}x${stable.height} mounted=${stable.sentinel === "keep"} page=${pageHeightBefore}->${pageHeightAfter}`,
    );
    if (stable.sentinel !== "keep") {
      throw new Error("sticker change remounted the preview image");
    }
    if (
      Math.abs(stable.width - sizeBefore.width) > 1 ||
      Math.abs(stable.height - sizeBefore.height) > 1
    ) {
      throw new Error(
        `sticker change resized the preview: ${sizeBefore.width}x${sizeBefore.height} -> ${stable.width}x${stable.height}`,
      );
    }
    if (Math.abs(pageHeightAfter - pageHeightBefore) > 1) {
      throw new Error(
        `sticker change moved the page: ${pageHeightBefore} -> ${pageHeightAfter}`,
      );
    }
    log("sticker change kept the preview mounted and stable");

    if (
      (await page.getByText(/Frame event hanya muncul di layout yang sesuai/i).count()) > 0
    ) {
      throw new Error("Strip 3 should not show the hidden-frame notice");
    }

    // A different layout must not offer the Strip 3 event frames.
    await seedDraft(page, "GRID_4", 4);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      `(() => {
        const img = document.querySelector('img[alt^="Pratinjau strip foto"]');
        return !!img && img.naturalWidth === 1200 && img.naturalHeight === 1200;
      })()`,
      { timeout: 30000 },
    );

    const kulturCount = await page.getByRole("button", { name: /Kultur/i }).count();
    const fiksiCount = await page.getByRole("button", { name: /Fiksi/i }).count();
    log("Grid 2x2 picker", `Kultur=${kulturCount} Fiksi=${fiksiCount}`);
    if (kulturCount !== 0 || fiksiCount !== 0) {
      throw new Error("Strip 3 event frames leaked into the Grid 2x2 picker");
    }
    const notice = page.getByText(
      /Frame event hanya muncul di layout yang sesuai/i,
    );
    await notice.waitFor({ state: "visible", timeout: 10000 });
    if ((await notice.count()) === 0) {
      throw new Error("Grid 2x2 is missing the hidden-frame notice");
    }

    console.log("FRAME_OK");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("FRAME_FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
