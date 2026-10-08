import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ['/', '/booth', '/privacy', '/gallery', '/studio', '/e/launch-party', '/p/invalid'];
const sizes = [360, 390, 430, 768, 1024, 1280, 1440];

const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
console.log('width route issues');
for (const route of routes) {
  for (const width of sizes) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, permissions: ['camera'], deviceScaleFactor: 1, colorScheme: 'light' });
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(800);
      const res = await page.evaluate(() => ({
        client: { w: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth },
        body: { sw: document.body.scrollWidth }
      }));
      const overflow = res.body.sw - res.client.w;
      if (overflow > 1) console.log(`${route} @${width}: overflow ${overflow}px`);
    } catch (e) {
      console.log(`${route} @${width}: ${e.message}`);
    } finally { await context.close(); }
  }
}
await browser.close();
console.log('done');
