import { chromium, type Download, type Page } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

function log(step: string, detail = "") {
  console.log(`[download] ${step}${detail ? ` -> ${detail}` : ""}`);
}

async function readCount(page: Page) {
  const status = page.getByText(/kali diunduh/i).first();
  await status.waitFor({ state: "visible", timeout: 20000 });
  const text = (await status.textContent())?.trim() ?? "";
  const parsed = Number.parseInt(text, 10);
  return { text, value: Number.isFinite(parsed) ? parsed : -1 };
}

/**
 * The result page is server-rendered, so a click can land before React attaches
 * its handler. The anchor would then follow its href natively: the file still
 * downloads, but the tally never updates. Wait for the props React hangs off
 * the DOM node before treating a click as the client-side path.
 */
async function waitForHydration(page: Page) {
  await page.waitForFunction(
    `(() => {
      const anchor = [...document.querySelectorAll("a")].find((el) =>
        /Unduh PNG/i.test(el.textContent || "")
      );
      if (!anchor) return false;
      return Object.keys(anchor).some((key) => key.startsWith("__reactProps$"));
    })()`,
    undefined,
    { timeout: 20000 },
  );
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  try {
    const png = await page.evaluate(`(() => {
      const c = document.createElement("canvas");
      c.width = 300; c.height = 600;
      const x = c.getContext("2d");
      x.fillStyle = "#ff3d8b"; x.fillRect(0, 0, 300, 600);
      x.fillStyle = "#ffd23f"; x.fillRect(30, 30, 240, 240);
      return c.toDataURL("image/png");
    })()`);

    const created = await context.request.post(`${BASE}/api/sessions`, {
      data: { image: png, layoutType: "STRIP_3", filterKey: "original" },
    });
    if (!created.ok()) {
      throw new Error(`seed failed: ${created.status()} ${await created.text()}`);
    }
    const { accessKey } = (await created.json()) as { accessKey: string };
    log("session seeded", accessKey);

    await page.goto(`${BASE}/p/${accessKey}`, { waitUntil: "domcontentloaded" });

    const before = await readCount(page);
    log("initial tally", before.text);
    if (before.value !== 0) {
      throw new Error(`a fresh session should start at 0, got ${before.value}`);
    }

    // A marker on window proves the count updates in place rather than the page
    // reloading and re-reading the old server render.
    await page.evaluate(`window.__survived = true`);
    await waitForHydration(page);
    log("hydrated", "client handler attached");

    for (const round of [1, 2]) {
      const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
      await page.getByRole("link", { name: /Unduh PNG/i }).click();

      const download: Download = await downloadPromise;
      const suggested = download.suggestedFilename();
      log(`round ${round} download event`, suggested);
      if (!suggested.endsWith(".png")) {
        throw new Error(`unexpected download filename: ${suggested}`);
      }

      // The tally only updates once the whole body has arrived, so give the
      // fetch a moment to settle after the browser reports the download.
      await page.waitForFunction(
        (expected: number) => {
          const node = [...document.querySelectorAll("p")].find((p) =>
            /kali diunduh/i.test(p.textContent ?? ""),
          );
          if (!node) return false;
          const value = Number.parseInt(node.textContent ?? "", 10);
          return Number.isFinite(value) && value === expected;
        },
        round,
        { timeout: 20000 },
      );

      const after = await readCount(page);
      log(`round ${round} tally`, after.text);
      if (after.value !== round) {
        throw new Error(`tally should read ${round}, got ${after.value}`);
      }
    }

    const survived = await page.evaluate(`window.__survived === true`);
    if (!survived) {
      throw new Error("page reloaded instead of updating the tally in place");
    }
    log("no reload", "window marker survived both downloads");

    console.log("DOWNLOAD_OK");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("DOWNLOAD_FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});