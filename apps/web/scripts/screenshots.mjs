// Takes screenshots of every screen at 360/768/1280 px in ar and fr, and reports horizontal overflow
// and console errors. The API must run with the demo data (pnpm --filter api db:seed).
// Usage: node scripts/screenshots.mjs [webUrl] [apiUrl]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:3100';
const api = process.argv[3] ?? 'http://localhost:4010';
const out = new URL('../../../docs/screenshots/', import.meta.url).pathname;
const pages = {
  home: '',
  design: 'design',
  business: 'b/salon-nour',
  book: 'b/salon-nour/book',
  dashboard: 'dashboard',
  calendar: 'dashboard/calendar',
  login: 'login',
  register: 'register',
  onboarding: 'onboarding',
  services: 'dashboard/services',
  staff: 'dashboard/staff',
  settings: 'dashboard/settings',
};
const widths = [360, 768, 1280];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const problems = [];

// Log in once as the demo owner and reuse the cookies (the login route is rate limited).
const loginCtx = await browser.newContext();
const login = await loginCtx.request.post(`${api}/auth/login`, {
  data: { email: 'owner.salon@mawid.demo', password: 'Demo1234!' },
});
if (!login.ok())
  throw new Error(`Login failed (${login.status()}). Is the API running with the seed data?`);
const storageState = await loginCtx.storageState();
await loginCtx.close();
for (const locale of ['ar', 'fr']) {
  for (const width of widths) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, storageState });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    for (const [name, path] of Object.entries(pages)) {
      errors.length = 0;
      await page.goto(`${base}/${locale}/${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      if (page.url().includes('/login') && name !== 'login' && name !== 'register')
        problems.push(`${locale} ${width} ${name}: redirected to login`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      const dir = await page.evaluate(() => document.documentElement.dir);
      if (overflow > 0)
        problems.push(`${locale} ${width} ${name}: horizontal overflow ${overflow}px`);
      if (locale === 'ar' && dir !== 'rtl') problems.push(`${locale} ${name}: dir=${dir}`);
      if (errors.length)
        problems.push(`${locale} ${width} ${name}: console ${errors.join(' | ').slice(0, 200)}`);
      await page.screenshot({ path: `${out}${name}-${locale}-${width}.png`, fullPage: true });
    }
    await ctx.close();
  }
}
await browser.close();
console.log(problems.length ? problems.join('\n') : 'No problems found');
