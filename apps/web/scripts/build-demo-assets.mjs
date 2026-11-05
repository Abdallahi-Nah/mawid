// Turns the SVG illustrations of apps/api/prisma/demo-assets into PNG files (the upload format of the app).
// The illustrations are original work made for this project. Run again only if you change an SVG.
// Usage: node scripts/build-demo-assets.mjs
import { chromium } from 'playwright';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../../api/prisma/demo-assets/', import.meta.url);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
for (const file of readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
  const svg = readFileSync(new URL(file, dir), 'utf8');
  const size = Number(/width="(\d+)"/.exec(svg)?.[1] ?? 256);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  const png = await page.screenshot({
    type: 'png',
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  });
  writeFileSync(new URL(file.replace('.svg', '.png'), dir), png);
  console.log('ok', file, `${Math.round(png.length / 1024)} KB`);
}
await browser.close();
