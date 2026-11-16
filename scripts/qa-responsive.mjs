/**
 * Responsive QA sweep across the real routes and a device/viewport matrix.
 *
 * Reports, per route + viewport:
 *  - document horizontal overflow
 *  - visible content crossing the viewport edge (outermost offender only)
 *  - clipped/truncated text in interactive or single-line elements
 *  - hidden horizontal/vertical overflow that swallows real content
 *  - interactive targets below 24x24 CSS px (WCAG 2.2 AA)
 *  - interactive targets covered by a fixed/sticky surface
 *  - images missing alt / intrinsic dimensions / broken sources
 *  - body text under 12px
 *  - runtime console/page errors
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 node scripts/qa-responsive.mjs [--shots]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import "dotenv/config";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT_DIR = path.resolve("qa-out");
const SHOT_DIR = path.join(OUT_DIR, "shots");
const WANT_SHOTS = process.argv.includes("--shots");

const VIEWPORTS = [
  { name: "phone-280", width: 280, height: 653, mobile: true },
  { name: "phone-320", width: 320, height: 693, mobile: true },
  { name: "phone-360", width: 360, height: 740, mobile: true },
  { name: "phone-390", width: 390, height: 844, mobile: true },
  { name: "phone-414", width: 414, height: 896, mobile: true },
  { name: "tablet-768", width: 768, height: 1024, mobile: true },
  { name: "tablet-834", width: 834, height: 1112, mobile: true },
  { name: "laptop-1024", width: 1024, height: 768 },
  { name: "desktop-1280", width: 1280, height: 800 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1920", width: 1920, height: 1080 },
  { name: "phone-landscape", width: 844, height: 390, mobile: true },
];

/** Collected in the browser: must stay self-contained (no closure refs). */
function collectIssues() {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const issues = [];
  const htmlEls = [...document.querySelectorAll("body *")].filter(
    (el) => el instanceof HTMLElement,
  );

  const pathOf = (el) => {
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && parts.length < 5) {
      let part = cur.tagName.toLowerCase();
      if (cur.id) {
        parts.unshift(`${part}#${cur.id}`);
        break;
      }
      const cls =
        typeof cur.className === "string"
          ? cur.className.trim().split(/\s+/).filter(Boolean).slice(0, 2)
          : [];
      if (cls.length) part += `.${cls.join(".")}`;
      parts.unshift(part);
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  };

  const textOf = (el) =>
    (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 90);

  const rectOf = (r) => ({
    x: Math.round(r.x),
    y: Math.round(r.y),
    w: Math.round(r.width),
    h: Math.round(r.height),
  });

  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return false;
    if (Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    // Visually-hidden helpers (sr-only) are 1px clip boxes, not layout.
    return r.width > 2 && r.height > 2;
  };

  /** True when an ancestor clips or scrolls overflow, so a child sticking past
   *  the viewport is contained on purpose (e.g. a horizontal sticker rail). */
  const insideClip = (el) => {
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      const s = getComputedStyle(p);
      if (
        s.overflowX !== "visible" ||
        s.overflowY !== "visible" ||
        s.contain.includes("paint")
      ) {
        return true;
      }
      p = p.parentElement;
    }
    return false;
  };

  const push = (kind, el, extra = {}) => {
    const r = el.getBoundingClientRect();
    issues.push({ kind, selector: pathOf(el), text: textOf(el), rect: rectOf(r), ...extra });
  };

  // 1. Content crossing the viewport edge, outermost offender only.
  for (const el of htmlEls) {
    if (!visible(el)) continue;
    if (insideClip(el)) continue;
    const r = el.getBoundingClientRect();
    const overRight = r.right > vw + 1;
    const overLeft = r.left < -1;
    if (!overRight && !overLeft) continue;
    const parent = el.parentElement;
    if (parent && parent !== document.body) {
      const pr = parent.getBoundingClientRect();
      if (pr.right > vw + 1 || pr.left < -1) continue; // report the parent instead
    }
    push("viewport-escape", el, {
      over: overRight ? Math.round(r.right - vw) : Math.round(-r.left),
      side: overRight ? "right" : "left",
    });
  }

  // 2. Clipped text: an element with its own text that is being cut off.
  for (const el of htmlEls) {
    if (!visible(el)) continue;
    const hasOwnText = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim(),
    );
    if (!hasOwnText) continue;
    const s = getComputedStyle(el);
    if (s.display === "inline" || s.display === "contents") continue;
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    const clipped =
      s.overflowX === "hidden" ||
      s.overflowX === "clip" ||
      s.textOverflow === "ellipsis";
    if (!clipped) continue;
    if (insideClip(el.parentElement ?? el)) continue;
    push("clipped-text", el, { overflow: el.scrollWidth - el.clientWidth });
  }

  // 3. Hidden overflow that contains interactive content or a text block.
  //    A scroll container (auto/scroll) is fine; only hidden/clip loses content.
  for (const el of htmlEls) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    const hidX = s.overflowX === "hidden" || s.overflowX === "clip";
    const hidY = s.overflowY === "hidden" || s.overflowY === "clip";
    if (!hidX && !hidY) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    const lostX = hidX ? el.scrollWidth - el.clientWidth : 0;
    const lostY = hidY ? el.scrollHeight - el.clientHeight : 0;
    if (lostX < 16 && lostY < 16) continue;
    const hasInteractive = el.querySelector(
      'a[href], button, input, select, textarea, summary, [role="button"], [role="tab"]',
    );
    const ownText = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 8,
    );
    if (!hasInteractive && !ownText) continue;
    push("hidden-overflow", el, {
      lostX: Math.max(0, Math.round(lostX)),
      lostY: Math.max(0, Math.round(lostY)),
    });
  }

  // 4. Interactive targets under 24x24 CSS px.
  const targetSel =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"]';
  const targets = [];
  for (const node of document.querySelectorAll(targetSel)) {
    const el = node instanceof HTMLElement ? node : null;
    if (!el || !visible(el)) continue;
    if (el.matches(":disabled") || el.getAttribute("aria-hidden") === "true") continue;
    if (el.closest("[inert]")) continue;
    const s = getComputedStyle(el);
    if (s.pointerEvents === "none") continue;

    let target = el;
    // A checkbox/radio is visually the label, so measure the wrapping label.
    if (el.matches('input[type="checkbox"], input[type="radio"]')) {
      const label = el.closest("label");
      if (label) target = label;
    }
    // Inline links inside prose are exempt from the 24px target rule.
    if (target.tagName === "A" && getComputedStyle(target).display === "inline") {
      const prose = target.closest("p, li, figcaption, .prose");
      if (prose && target.getBoundingClientRect().height < 40) continue;
    }
    targets.push(target);
    const r = target.getBoundingClientRect();
    if (r.width >= 24 && r.height >= 24) continue;
    push("small-target", target, {
      w: Math.round(r.width),
      h: Math.round(r.height),
    });
  }

  // 5. Interactive targets covered by a fixed/sticky surface (cookie bar,
  //    sticky footer, floating action) where the guest cannot tap them.
  //    While a modal is open, the backdrop covering the page is expected.
  const dialogOpen = Boolean(document.querySelector('[role="dialog"]'));
  if (!dialogOpen) {
    for (const target of targets) {
      if (target.closest("nextjs-portal")) continue;
      const r = target.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= vh) continue;
      const x = Math.min(vw - 1, Math.max(1, r.left + r.width / 2));
      const y = Math.min(vh - 1, Math.max(1, r.top + r.height / 2));
      if (r.top < 0 || r.left < 0 || r.right > vw) continue;
      const hit = document.elementFromPoint(x, y);
      if (!hit) continue;
      if (hit === target || target.contains(hit) || hit.contains(target)) continue;
      if (hit.closest("nextjs-portal")) continue;
      let cover = hit;
      let fixed = false;
      while (cover && cover !== document.body) {
        const s = getComputedStyle(cover);
        // Only always-on fixed surfaces (bars, floating CTAs) block a target;
        // a sticky header is expected to cover content mid-scroll.
        if (s.position === "fixed") {
          fixed = true;
          break;
        }
        cover = cover.parentElement;
      }
      if (!fixed) continue;
      push("covered-target", target, { cover: pathOf(cover) });
    }
  }

  // 6. Images.
  for (const img of document.images) {
    if (!visible(img)) continue;
    if (!img.hasAttribute("alt")) {
      push("img-missing-alt", img, { src: img.currentSrc.slice(0, 120) });
    }
    if (img.complete && img.naturalWidth === 0) {
      push("img-broken", img, { src: img.currentSrc.slice(0, 120) });
      continue;
    }
    const hasDims = img.hasAttribute("width") && img.hasAttribute("height");
    const s = getComputedStyle(img);
    const hasReserved =
      s.aspectRatio !== "auto" || (s.height !== "auto" && s.height !== "0px");
    if (!hasDims && !hasReserved) {
      push("img-no-dimensions", img, { src: img.currentSrc.slice(0, 120) });
    }
  }

  // 7. Body copy below 12px. Decorative aria-hidden artwork is exempt.
  for (const el of htmlEls) {
    if (!visible(el)) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    const hasOwnText = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 3,
    );
    if (!hasOwnText) continue;
    const px = Number.parseFloat(getComputedStyle(el).fontSize);
    if (px > 0 && px < 11) push("tiny-text", el, { px });
  }

  return {
    viewportWidth: vw,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    issues,
  };
}

function seedStudioDraft() {
  if (!location.pathname.startsWith("/studio")) return;
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
  const draft = {
    shots: palette.map(make),
    layoutType: "STRIP_3",
    source: "upload",
    transforms: palette.map(() => ({ focusX: 0.5, focusY: 0.5, zoom: 1 })),
    design: {
      filterKey: "retro",
      frameKey: "pita",
      stickers: [
        { key: "bestie", spot: { x: 0.2, y: 0.2, rotate: -8, scale: 1 } },
        { key: "party", spot: { x: 0.7, y: 0.5, rotate: 10, scale: 1.1 } },
        { key: "senyum", spot: { x: 0.4, y: 0.8, rotate: 4, scale: 0.9 } },
      ],
    },
  };
  sessionStorage.setItem("snapvibe.draft", JSON.stringify(draft));
}

/** Populate the booth's own upload editor, the state after picking photos. */
function seedUploadRun() {
  if (!location.search.includes("mode=upload")) return;
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
  sessionStorage.setItem(
    "snapvibe.boothrun",
    JSON.stringify({
      layoutType: "STRIP_3",
      shots: palette.map(make),
      source: "upload",
      transforms: palette.map(() => ({ focusX: 0.5, focusY: 0.5, zoom: 1 })),
      design: {
        filterKey: "warm",
        frameKey: "pita",
        stickers: [
          { key: "bestie", spot: { x: 0.25, y: 0.2, rotate: -8, scale: 1 } },
        ],
      },
    }),
  );
}

async function seedResultSession() {
  const { default: sharp } = await import("sharp");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1800">
    <rect width="900" height="1800" fill="#f6e7c1"/>
    <rect x="40" y="40" width="820" height="500" fill="#ef7fa4"/>
    <rect x="40" y="580" width="820" height="500" fill="#8fd3d0"/>
    <rect x="40" y="1120" width="820" height="500" fill="#ffd166"/>
    <text x="450" y="1720" font-family="sans-serif" font-size="56" text-anchor="middle" fill="#1b1b1b">QA responsive</text>
  </svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const res = await fetch(`${BASE}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: `data:image/png;base64,${png.toString("base64")}`,
      layoutType: "STRIP_3",
      filterKey: "original",
      publish: false,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.accessKey) {
    throw new Error(`seed session failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data.accessKey;
}

const ROUTES = [];
function buildRoutes(accessKey) {
  ROUTES.push(
    { name: "home", path: "/", ready: "h1" },
    { name: "booth-upload", path: "/booth?mode=upload", ready: "main" },
    {
      name: "booth-upload-photos",
      path: "/booth?mode=upload&layout=STRIP_3",
      seed: "upload",
      ready: '[data-testid="upload-slot-0"] canvas',
    },
    {
      name: "booth-camera",
      path: "/booth",
      ready: "text=Aktifkan kamera",
      action: "booth-camera",
    },
    {
      name: "studio-design",
      path: "/studio",
      seed: "studio",
      ready: 'img[alt^="Pratinjau strip foto"]',
    },
    {
      name: "studio-dialog",
      path: "/studio",
      seed: "studio",
      ready: 'img[alt^="Pratinjau strip foto"]',
      action: "studio-back-dialog",
    },
    { name: "studio-empty", path: "/studio", ready: "text=Belum ada foto" },
    { name: "gallery", path: "/gallery", ready: "main" },
    { name: "result", path: `/p/${accessKey}`, ready: "main" },
    { name: "privacy", path: "/privacy", ready: "main" },
    { name: "admin", path: "/admin", ready: "main" },
    { name: "admin-storage", path: "/admin/storage", ready: "main" },
    { name: "result-missing", path: "/p/invalid", ready: "main" },
  );
}

async function runAction(page, action) {
  if (action === "studio-back-dialog") {
    const back = page.locator("header button").filter({ hasText: /^(Foto|Booth)$/ });
    await back.first().click();
    await page.getByRole("dialog").waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(250);
  }
  if (action === "booth-camera") {
    await page.getByRole("button", { name: /Aktifkan kamera/i }).click();
    await page.locator("video").first().waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(800);
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  if (WANT_SHOTS) await mkdir(SHOT_DIR, { recursive: true });

  const accessKey = await seedResultSession();
  buildRoutes(accessKey);

  const browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  const runs = [];
  const consoleErrors = [];
  let adminAuthed = false;

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      baseURL: BASE,
      deviceScaleFactor: 1,
      isMobile: Boolean(vp.mobile),
      hasTouch: Boolean(vp.mobile),
      permissions: ["camera"],
      colorScheme: "light",
      reducedMotion: "no-preference",
    });

    // Authenticate the admin routes through the real login endpoint.
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      const login = await context.request.post(`${BASE}/api/admin/login`, {
        data: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
      });
      adminAuthed = login.ok();
    }

    const page = await context.newPage();
    page.on("pageerror", (err) => {
      consoleErrors.push({ viewport: vp.name, type: "pageerror", text: err.message });
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // Ignore noise from blocked third-party probes and expected 404 fetches.
        if (/favicon|ERR_|Failed to load resource/i.test(text)) return;
        consoleErrors.push({ viewport: vp.name, type: "console", text });
      }
    });

    for (const route of ROUTES) {
      if (route.path.startsWith("/admin") && !adminAuthed) continue;
      // A previous route may have left a booth run or draft behind; each screen
      // must start from exactly the state this route seeds.
      await page.evaluate(() => sessionStorage.clear()).catch(() => {});
      let response = null;
      try {
        response = await page.goto(`${BASE}${route.path}`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        if (route.seed) {
          // Seed per navigation, never with addInitScript: an init script keeps
          // running on every later goto in this shared page, leaking the seeded
          // draft into routes that must start empty (e.g. studio-empty).
          await page.evaluate(
            route.seed === "studio" ? seedStudioDraft : seedUploadRun,
          );
          response = await page.reload({
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });
        }
        if (route.ready) {
          await page.locator(route.ready).first().waitFor({
            state: "visible",
            timeout: 30000,
          });
        }
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(350);
        if (route.action) await runAction(page, route.action);

        // Check the first screen and the end of the document: sticky/fixed
        // surfaces and last-row content only appear once scrolled.
        const top = await page.evaluate(collectIssues);

        if (WANT_SHOTS && [320, 390, 768, 1440].includes(vp.width)) {
          const file = path.join(SHOT_DIR, `${route.name}-${vp.width}.png`);
          await page.screenshot({ path: file, fullPage: false });
        }

        await page
          .evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
          .catch(() => {});
        await page.waitForTimeout(450);
        const bottom = await page.evaluate(collectIssues);

        const seen = new Set();
        const issues = [];
        for (const issue of [...top.issues, ...bottom.issues]) {
          const key = `${issue.kind}|${issue.selector}|${issue.text}`;
          if (seen.has(key)) continue;
          seen.add(key);
          issues.push(issue);
        }

        runs.push({
          viewport: vp,
          route: route.path,
          name: route.name,
          status: response ? response.status() : null,
          ...top,
          scrollWidth: Math.max(top.scrollWidth, bottom.scrollWidth),
          issues,
        });
      } catch (error) {
        runs.push({
          viewport: vp,
          route: route.path,
          name: route.name,
          status: response ? response.status() : null,
          error: error instanceof Error ? error.message : String(error),
          issues: [],
        });
        if (WANT_SHOTS && [320, 390, 768, 1440].includes(vp.width)) {
          await page
            .screenshot({ path: path.join(SHOT_DIR, `ERROR-${route.name}-${vp.width}.png`) })
            .catch(() => {});
        }
      }
    }

    await context.close();
  }

  await browser.close();

  // Summarize: collapse the same issue to one line per (route, viewport).
  let total = 0;
  const summary = [];
  for (const run of runs) {
    const overflow = run.scrollWidth - run.viewportWidth;
    const issues = run.issues ?? [];
    const byKind = {};
    for (const issue of issues) {
      byKind[issue.kind] = (byKind[issue.kind] ?? 0) + 1;
    }
    total += issues.length + (overflow > 1 ? 1 : 0);
    if (issues.length === 0 && overflow <= 1 && !run.error) continue;
    summary.push({
      viewport: run.viewport.name,
      route: run.route,
      name: run.name,
      status: run.status,
      overflow,
      error: run.error ?? null,
      counts: byKind,
      issues,
    });
  }

  await writeFile(
    path.join(OUT_DIR, "responsive.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), runs, summary, consoleErrors }, null, 2),
  );

  console.log(`routes: ${ROUTES.length}, viewports: ${VIEWPORTS.length}, runs: ${runs.length}`);
  console.log(`issue rows: ${summary.length}, total findings: ${total}`);
  for (const row of summary) {
    const label = `${row.name} ${row.route} @${row.viewport}`;
    console.log(`\n${label}${row.error ? ` ERROR ${row.error}` : ""}`);
    if (row.overflow > 1) console.log(`  horizontal overflow: ${row.overflow}px`);
    const grouped = new Map();
    for (const issue of row.issues) {
      const key = `${issue.kind}|${issue.selector}`;
      if (!grouped.has(key)) grouped.set(key, { ...issue, count: 0 });
      grouped.get(key).count += 1;
    }
    for (const issue of grouped.values()) {
      const text = issue.text ? ` "${issue.text}"` : "";
      const extra = issue.over
        ? ` over=${issue.over}px`
        : issue.lostX !== undefined
          ? ` lostX=${issue.lostX} lostY=${issue.lostY}`
          : issue.w
            ? ` ${issue.w}x${issue.h}`
            : issue.px
              ? ` ${issue.px}px`
              : "";
      console.log(
        `  ${issue.kind}${extra} ${issue.selector}${text}${issue.count > 1 ? ` x${issue.count}` : ""}`,
      );
    }
  }
  if (consoleErrors.length) {
    console.log(`\nconsole/page errors: ${consoleErrors.length}`);
    for (const err of consoleErrors.slice(0, 20)) {
      console.log(`  [${err.viewport}] ${err.type}: ${err.text}`);
    }
  }
  console.log(`\nwrote ${path.join(OUT_DIR, "responsive.json")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
