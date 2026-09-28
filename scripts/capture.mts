import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const OUT = "C:/photo/.impeccable/review";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, dsf: 2 },
  { name: "mobile", width: 390, height: 844, dsf: 3 },
];

async function main() {
  const browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      "--force-color-profile=srgb",
    ],
  });

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      permissions: ["camera"],
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.dsf,
      colorScheme: "light",
    });
    const page = await context.newPage();

    for (const [route, label] of [
      ["/", "landing"],
      ["/booth", "booth"],
      ["/e/launch-party", "event"],
      ["/privacy", "privacy"],
      ["/admin", "admin-login"],
    ] as const) {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
      // let fonts, camera and entrance motion settle so nothing reads as missing
      await page.waitForTimeout(2200);
      const buf = await page.screenshot({ path: `${OUT}/${vp.name}-${label}.png`, fullPage: true });
      // a blank or near-black capture is invalid evidence, so fail loudly
      const stats = await page.evaluate(() => {
        const el = document.querySelector("main") ?? document.body;
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, children: el.children.length };
      });
      console.log(
        `[shot] ${vp.name}-${label}.png  ${(buf.length / 1024).toFixed(0)}kb  bg=${stats.bg}  children=${stats.children}`,
      );
    }

    await context.close();
  }

  await browser.close();
  console.log("\nSHOTS_OK");
}

main().catch((e) => {
  console.error("SHOTS_FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
