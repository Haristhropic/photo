/**
 * Production performance audit.
 *
 * Measures, per route and device profile:
 *  - TTFB, FCP, LCP, CLS
 *  - total blocking time (long-task proxy for INP)
 *  - request count and transferred bytes, split by resource type
 *  - largest transferred resources
 *
 * Bytes come from CDP Network.loadingFinished (encodedDataLength), so
 * cross-origin images count even when their Resource Timing entry hides
 * transferSize. Each run uses a fresh context with the HTTP cache disabled.
 *
 * Usage:
 *   BASE_URL=http://localhost:3101 node scripts/perf-audit.mjs [--runs=3]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import "dotenv/config";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3101";
const OUT_DIR = path.resolve("perf-out");
const RUNS = Number((process.argv.find((a) => a.startsWith("--runs=")) ?? "--runs=3").split("=")[1]);

const PROFILES = [
  {
    name: "mobile-slow4g",
    viewport: { width: 360, height: 740 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    cpuThrottle: 4,
    network: {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
      connectionType: "cellular4g",
    },
  },
  {
    name: "desktop-cable",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    cpuThrottle: 1,
    network: null,
  },
];

/** Runs before any page script: performance observers that survive the SPA. */
const OBSERVER = `(() => {
  window.__perf = { lcp: 0, lcpEl: "", cls: 0, longTotal: 0, longMax: 0, longTasks: [] };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.startTime <= window.__perf.lcp) continue;
        window.__perf.lcp = e.startTime;
        const el = e.element;
        window.__perf.lcpEl = el && el.tagName
          ? el.tagName.toLowerCase() + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\\s+/)[0] : "")
          : (e.url || "");
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) window.__perf.cls += e.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__perf.longTasks.push({ start: Math.round(e.startTime), dur: Math.round(e.duration), name: e.name });
        window.__perf.longTotal += e.duration;
        window.__perf.longMax = Math.max(window.__perf.longMax, e.duration);
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {}
})();`;

async function seedResultSession() {
  const { default: sharp } = await import("sharp");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1800">
    <rect width="900" height="1800" fill="#f6e7c1"/>
    <rect x="40" y="40" width="820" height="500" fill="#ef7fa4"/>
    <rect x="40" y="580" width="820" height="500" fill="#8fd3d0"/>
    <rect x="40" y="1120" width="820" height="500" fill="#ffd166"/>
    <text x="450" y="1720" font-family="sans-serif" font-size="56" text-anchor="middle" fill="#1b1b1b">Perf strip</text>
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

/** A 3-shot draft for /studio, embedded as an init script. */
function studioSeedContent() {
  const palette = ["#ff2020", "#20c020", "#2020ff"];
  const payload = JSON.stringify({
    shots: palette.map(
      (color) =>
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="${color}"/></svg>`,
        )}`,
    ),
    layoutType: "STRIP_3",
    eventId: null,
    source: "upload",
    transforms: palette.map(() => ({ focusX: 0.5, focusY: 0.5, zoom: 1 })),
    design: {
      filterKey: "retro",
      frameKey: "pita",
      stickers: [{ key: "bestie", spot: { x: 0.2, y: 0.2, rotate: -8, scale: 1 } }],
    },
  });
  return `try { sessionStorage.setItem("snapvibe.draft", ${JSON.stringify(payload)}); } catch (e) {}`;
}

function routeList(accessKey) {
  return [
    { name: "home", path: "/" },
    { name: "booth-upload", path: "/booth?mode=upload" },
    { name: "studio", path: "/studio", seed: "studio" },
    { name: "gallery", path: "/gallery" },
    { name: "result", path: `/p/${accessKey}` },
  ];
}

function classify(url, mime) {
  if (mime === "text/html" || url.endsWith("/") || !/\.[a-z0-9]+(\?|$)/i.test(url)) {
    if (mime === "text/html") return "html";
  }
  if (/\.(js|mjs)(\?|$)/i.test(url) || mime.includes("javascript")) return "js";
  if (/\.css(\?|$)/i.test(url) || mime.includes("text/css")) return "css";
  if (/\.(woff2?|ttf|otf)(\?|$)/i.test(url) || mime.includes("font")) return "font";
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/i.test(url) || url.includes("/_next/image")) {
    return "image";
  }
  if (mime.startsWith("video/")) return "video";
  return "other";
}

async function runOnce(browser, route, profile) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    colorScheme: "light",
    reducedMotion: "no-preference",
    serviceWorkers: "block",
  });
  if (route.seed === "studio") {
    await context.addInitScript({ content: studioSeedContent() });
  }
  await context.addInitScript({ content: OBSERVER });

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  if (profile.network) {
    await cdp.send("Network.emulateNetworkConditions", profile.network);
  }
  if (profile.cpuThrottle > 1) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpuThrottle });
  }

  const requests = new Map();
  cdp.on("Network.responseReceived", (event) => {
    requests.set(event.requestId, {
      url: event.response.url,
      mime: event.response.mimeType || "",
      status: event.response.status,
      bytes: 0,
    });
  });
  cdp.on("Network.loadingFinished", (event) => {
    const entry = requests.get(event.requestId);
    if (entry) entry.bytes = event.encodedDataLength;
  });

  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const started = Date.now();
  const response = await page.goto(`${BASE}${route.path}`, {
    // `load` waits for every image; a heavy gallery on slow 4G can exceed any
    // sane cap. Wait for DOM ready, then let the page settle on its own.
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  const status = response ? response.status() : null;
  await page
    .waitForFunction(() => document.readyState === "complete", { timeout: 20000 })
    .catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  // Let LCP/CLS settle: late images and fonts can still shift the layout.
  await page.waitForTimeout(2500);

  const pageData = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paints = performance.getEntriesByType("paint");
    const fcp = paints.find((p) => p.name === "first-contentful-paint");
    const perf = window.__perf ?? {};
    return {
      ttfb: nav ? Math.round(nav.responseStart) : null,
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      load: nav ? Math.round(nav.loadEventEnd) : null,
      fcp: fcp ? Math.round(fcp.startTime) : null,
      lcp: perf.lcp ? Math.round(perf.lcp) : null,
      lcpEl: perf.lcpEl ?? "",
      cls: perf.cls ? Number(perf.cls.toFixed(4)) : 0,
      longTotal: perf.longTotal ? Math.round(perf.longTotal) : 0,
      longMax: perf.longMax ? Math.round(perf.longMax) : 0,
      longCount: perf.longTasks ? perf.longTasks.length : 0,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    };
  });

  const totals = {};
  const resources = [];
  let requestCount = 0;
  for (const entry of requests.values()) {
    if (!entry.status || entry.status >= 400) continue;
    const kind = classify(entry.url, entry.mime);
    totals[kind] = (totals[kind] ?? 0) + entry.bytes;
    requestCount += 1;
    resources.push({
      kind,
      bytes: entry.bytes,
      url: entry.url.replace(BASE, "").slice(0, 140),
    });
  }
  const totalBytes = Object.values(totals).reduce((sum, n) => sum + n, 0);
  const biggest = resources.sort((a, b) => b.bytes - a.bytes).slice(0, 8);

  await context.close();

  return {
    profile: profile.name,
    route: route.name,
    path: route.path,
    status,
    wallMs: Date.now() - started,
    ...pageData,
    requestCount,
    totalBytes,
    bytes: totals,
    biggest,
    consoleErrors: consoleErrors.slice(0, 5),
  };
}

function median(values) {
  const sorted = values.filter((v) => typeof v === "number").sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const accessKey = await seedResultSession();
  const routes = routeList(accessKey);

  const browser = await chromium.launch({
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });

  const runs = [];
  for (const profile of PROFILES) {
    for (const route of routes) {
      for (let i = 0; i < RUNS; i += 1) {
        const result = await runOnce(browser, route, profile);
        runs.push(result);
        console.log(
          `[${profile.name}] ${route.name} #${i + 1} ` +
            `ttfb=${result.ttfb} fcp=${result.fcp} lcp=${result.lcp} cls=${result.cls} ` +
            `tbt=${result.longTotal} reqs=${result.requestCount} bytes=${Math.round(result.totalBytes / 1024)}KB`,
        );
      }
    }
  }

  await browser.close();

  const summary = [];
  for (const profile of PROFILES) {
    for (const route of routes) {
      const group = runs.filter((r) => r.profile === profile.name && r.route === route.name);
      const last = group[group.length - 1];
      summary.push({
        profile: profile.name,
        route: route.name,
        path: route.path,
        ttfb: median(group.map((r) => r.ttfb)),
        fcp: median(group.map((r) => r.fcp)),
        lcp: median(group.map((r) => r.lcp)),
        cls: median(group.map((r) => Math.round(r.cls * 10000) / 10000)),
        tbt: median(group.map((r) => r.longTotal)),
        longMax: median(group.map((r) => r.longMax)),
        requestCount: median(group.map((r) => r.requestCount)),
        totalKB: median(group.map((r) => Math.round(r.totalBytes / 1024))),
        bytesKB: Object.fromEntries(
          Object.entries(last.bytes).map(([kind, bytes]) => [kind, Math.round(bytes / 1024)]),
        ),
        lcpEl: last.lcpEl,
        loadedHeight: last.scrollHeight,
        biggest: last.biggest,
        consoleErrors: last.consoleErrors,
      });
    }
  }

  await writeFile(
    path.join(OUT_DIR, "perf.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, runs, summary }, null, 2),
  );

  console.log("\n=== medians ===");
  for (const row of summary) {
    console.log(
      `${row.profile.padEnd(14)} ${row.route.padEnd(13)} ` +
        `ttfb=${String(row.ttfb).padStart(4)} fcp=${String(row.fcp).padStart(4)} ` +
        `lcp=${String(row.lcp).padStart(4)} cls=${String(row.cls).padStart(6)} ` +
        `tbt=${String(row.tbt).padStart(4)} reqs=${String(row.requestCount).padStart(3)} ` +
        `kb=${String(row.totalKB).padStart(5)} ${JSON.stringify(row.bytesKB)}`,
    );
  }
  console.log(`\nwrote ${path.join(OUT_DIR, "perf.json")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
