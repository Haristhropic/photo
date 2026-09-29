import { chromium } from "playwright";

import dotenv from "dotenv";

dotenv.config();

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

function log(step: string, detail = "") {
  console.log(`[nav] ${step}${detail ? ` -> ${detail}` : ""}`);
}

/**
 * Lenis animates window scroll on its own rAF loop. An element Playwright
 * auto-scrolled to can still be moving when the click is dispatched, which
 * makes clicks land on whatever passes under the pointer instead. Wait for the
 * bounding box to hold still across two reads before clicking.
 */
async function clickWhenSettled(
  page: import("playwright").Page,
  locator: import("playwright").Locator,
) {
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

async function internalLinks(page: import("playwright").Page, path: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  return page.locator("a[href]").evaluateAll((nodes) =>
    nodes
      .map((n) => (n as HTMLAnchorElement).getAttribute("href") ?? "")
      .filter((h) => h.length > 0),
  );
}

async function main() {
  const browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const context = await browser.newContext({ permissions: ["camera"], viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const routes = ["/", "/booth", "/studio", "/privacy", "/admin", "/e/launch-party", "/p/nope-does-not-exist"];
  const bad: string[] = [];

  for (const route of routes) {
    const res = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    const status = res?.status() ?? 0;
    const expected = route === "/p/nope-does-not-exist" ? 200 : 200;
    log(`GET ${route}`, String(status));
    if (status !== expected) bad.push(`${route} returned ${status}`);
  }

  for (const route of ["/", "/booth", "/privacy", "/admin", "/e/launch-party"]) {
    const links = await internalLinks(page, route);
    for (const href of links) {
      if (/^(https?:|mailto:|tel:|#)/.test(href)) continue;
      const target = href.split("#")[0].split("?")[0];
      if (!target) continue;
      const res = await page.goto(`${BASE}${target}`, { waitUntil: "domcontentloaded" });
      const status = res?.status() ?? 0;
      if (status >= 400) bad.push(`${route} -> ${href} (${status})`);
    }
    log(`crawled links on ${route}`, `${links.length} link(s), all resolved`);
  }

  const homeFromBooth = await page.goto(`${BASE}/booth`, { waitUntil: "domcontentloaded" });
  void homeFromBooth;
  await page
    .getByRole("link", { name: "Kembali ke beranda", exact: true })
    .click();
  await page.waitForURL(`${BASE}/`, { timeout: 10000 });
  log("booth -> home via header link", page.url());

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await clickWhenSettled(page, page.getByRole("link", { name: /^Booth$/ }).first());
  await page.waitForURL("**/booth", { timeout: 10000 });
  log("home -> booth via footer", page.url());

  const studioLinks = await page.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded" });
  void studioLinks;
  await page.waitForTimeout(800);
  const studioCtas = await page.getByRole("link", { name: /booth|jepret/i }).count();
  const studioButtons = await page.getByRole("button", { name: /booth|jepret/i }).count();
  log("studio recovery affordances", `${studioCtas} link(s), ${studioButtons} button(s)`);
  if (studioCtas + studioButtons === 0) bad.push("/studio with no draft offers no way back to /booth");

  // The back-to-layout control is only meaningful once the guest is past the
  // layout picker, so the camera has to be live before it should exist.
  const chevronNamed = await page.goto(`${BASE}/booth`, { waitUntil: "domcontentloaded" });
  void chevronNamed;
  const introBtn = await page.evaluate(() => {
    const btn = document.querySelector("header button");
    return btn ? btn.getAttribute("aria-label") || btn.textContent?.trim() || "" : "";
  });
  log("booth header button on layout picker", introBtn || "(none, as expected)");

  const startCamera = page.getByRole("button", { name: /Aktifkan kamera/i });
  await startCamera.click({ timeout: 10000 });
  await startCamera.waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const unnamed = await page.evaluate(() => {
    const btn = document.querySelector("header button");
    return btn ? btn.getAttribute("aria-label") || btn.textContent?.trim() || "" : "";
  });
  log("booth header button past layout picker", unnamed || "(none)");
  if (!unnamed) bad.push("/booth offers no way back to the layout picker once the camera is live");

  // The header back control must exist on every screen and name where it
  // returns to. The trailing cases are open-redirect attempts: `from` is
  // user-supplied, so a crafted value must never escape the site.
  const backCases: Array<[string, string, string]> = [
    ["/booth", "/", "Kembali ke beranda"],
    ["/booth?from=studio", "/studio", "Kembali ke studio"],
    ["/booth?from=e/acara", "/e/acara", "Kembali ke event"],
    ["/booth?from=p/abc123", "/p/abc123", "Kembali ke foto"],
    ["/booth?from=https://evil.example", "/", "Kembali ke beranda"],
    ["/booth?from=//evil.example", "/", "Kembali ke beranda"],
    ["/booth?from=e/../../evil", "/", "Kembali ke beranda"],
  ];
  for (const [url, wantHref, wantLabel] of backCases) {
    await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    const got = await page.evaluate(() => {
      const el = document.querySelector('header a[aria-label^="Kembali ke"]');
      if (!el) return null;
      return {
        href: el.getAttribute("href") ?? "",
        label: el.getAttribute("aria-label") ?? "",
      };
    });
    if (!got) {
      bad.push(`/booth has no header back control on ${url}`);
      continue;
    }
    if (got.href !== wantHref || got.label !== wantLabel) {
      bad.push(`/booth back control on ${url} -> ${got.href} / ${got.label}, want ${wantHref} / ${wantLabel}`);
    } else {
      log("booth back control", `${url} -> ${got.href} (${got.label})`);
    }
  }

  // A late-resolving permission prompt must not yank the guest out of the
  // layout picker they just navigated to.
  const raceCtx = await browser.newContext({
    permissions: ["camera"],
    viewport: { width: 1440, height: 900 },
  });
  await raceCtx.addInitScript(`(() => {
    const md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) return;
    const real = md.getUserMedia.bind(md);
    md.getUserMedia = (c) => new Promise((res, rej) => {
      setTimeout(() => { real(c).then(res, rej); }, 3000);
    });
  })()`);
  const racePage = await raceCtx.newPage();
  await racePage.goto(`${BASE}/booth`, { waitUntil: "domcontentloaded" });
  await racePage.waitForTimeout(1200);
  await racePage.getByRole("button", { name: /Aktifkan kamera/i }).click();
  await racePage.waitForTimeout(300);
  await racePage.getByRole("button", { name: /Ganti layout/i }).click({ timeout: 10000 });
  await racePage.waitForTimeout(4500);
  const stillOnPicker = await racePage.evaluate(
    `document.querySelector("h1")?.textContent?.includes("Pilih layout") ?? false`,
  );
  log("booth holds layout picker through a late permission", String(stillOnPicker));
  if (!stillOnPicker) {
    bad.push("/booth dropped the guest back into the camera after a late permission grant");
  }
  await raceCtx.close();

  // The admin dashboard only renders its links once authenticated.
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    const login = await page.request.post(`${BASE}/api/admin/login`, {
      data: { email, password },
    });
    log("admin login", String(login.status()));
    if (!login.ok()) bad.push(`admin login failed (${login.status()})`);
    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
    const siteLinks = await page.getByRole("link", { name: /lihat situs/i }).count();
    log("admin -> public site link", `${siteLinks} found`);
    if (siteLinks === 0) bad.push("/admin offers no link back to the public site");
    await page.getByRole("link", { name: /lihat situs/i }).first().click();
    await page.waitForURL(`${BASE}/`, { timeout: 10000 });
    log("admin -> home", page.url());
  } else {
    log("admin nav", "skipped, ADMIN_EMAIL/ADMIN_PASSWORD not set");
  }

  await browser.close();

  if (bad.length > 0) {
    console.log("\nNAV_FAILED:");
    for (const b of bad) console.log(`  - ${b}`);
    process.exit(1);
  }
  console.log("\nNAV_OK");
}

main().catch((e) => { console.error("NAV_FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
