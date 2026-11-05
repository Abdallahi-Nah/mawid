// Page load on a throttled mobile connection (NFR-01: public page in under 2 s on 4G).
// "4G" = Chrome DevTools "Fast 4G" preset (9 Mbit/s down, 1.6 Mbit/s up, 165 ms latency) and a CPU 4x slower.
// It reports the median of 5 cold loads (no cache) of the largest paint (LCP) and of the load event.
// Needs the API and the web app running with the demo data (`pnpm --filter api db:seed`).
// Usage: node scripts/perf.mjs [webUrl]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:3100';
const pages = [
  ['public page (fr)', '/fr/b/salon-nour'],
  ['public page (ar)', '/ar/b/salon-nour'],
  ['booking flow (fr)', '/fr/b/salon-nour/book'],
];
const RUNS = 5;
const PROFILES = {
  'Fast 4G': { latency: 165, down: (9 * 1024 * 1024) / 8, up: (1.6 * 1024 * 1024) / 8 },
  'Slow 4G': { latency: 562, down: (1.6 * 1024 * 1024) / 8, up: (0.75 * 1024 * 1024) / 8 },
};
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

const browser = await chromium.launch({ channel: 'chrome' });
let slow = false;
for (const [profileName, p] of Object.entries(PROFILES)) {
  console.log(`\n${profileName} + CPU 4x slower, median of ${RUNS} cold loads`);
  for (const [label, path] of pages) {
    const lcps = [];
    const loads = [];
    const bytes = [];
    for (let i = 0; i < RUNS; i++) {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
      });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: p.latency,
        downloadThroughput: p.down,
        uploadThroughput: p.up,
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      let size = 0;
      cdp.on('Network.loadingFinished', (e) => (size += e.encodedDataLength));
      await page.addInitScript(() => {
        window.__lcp = 0;
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) window.__lcp = e.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      });
      await page.goto(base + path, { waitUntil: 'load' });
      await page.waitForTimeout(800);
      const m = await page.evaluate(() => ({
        lcp: window.__lcp,
        load: performance.getEntriesByType('navigation')[0].loadEventEnd,
      }));
      lcps.push(m.lcp);
      loads.push(m.load);
      bytes.push(size);
      await ctx.close();
    }
    const lcp = median(lcps);
    if (profileName === 'Fast 4G' && lcp > 2000) slow = true;
    console.log(
      `  ${lcp <= 2000 ? 'OK  ' : 'SLOW'} ${label.padEnd(18)} LCP ${(lcp / 1000).toFixed(2)} s   load ${(median(loads) / 1000).toFixed(2)} s   ${Math.round(median(bytes) / 1024)} KiB`,
    );
  }
}
await browser.close();
process.exit(slow ? 1 : 0);
