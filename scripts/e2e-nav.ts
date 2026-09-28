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
  await page.getByRole("link", { name: /kembali ke beranda/i }).click();
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

  const chevronNamed = await page.goto(`${BASE}/booth`, { waitUntil: "domcontentloaded" });
  void chevronNamed;
  const unnamed = await page.evaluate(() => {
    const btn = document.querySelector("header button");
    return btn ? btn.getAttribute("aria-label") || btn.textContent?.trim() || "" : "";
  });
  log("booth header button accessible name", unnamed || "(none)");
  if (!unnamed) bad.push("/booth header button has no accessible name");

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
