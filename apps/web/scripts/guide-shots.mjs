// Takes the screenshots used by the README and docs/USER_GUIDE*.md, from the demo data.
// Prepare: pnpm --filter api db:demo && pnpm --filter api db:seed, start the API with the scripted AI model
// (node apps/api/dist/dev/e2e-server.js) and the web app. Output: docs/images/*.jpg (JPEG, small files).
// Usage: node scripts/guide-shots.mjs [webUrl] [apiUrl]
import { chromium, request as pwRequest } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const base = process.argv[2] ?? 'http://localhost:3100';
const api = process.argv[3] ?? 'http://localhost:4010';
const out = new URL('../../../docs/images/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const msg = (l) =>
  JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), 'utf8'));
const get = (m, path) => path.split('.').reduce((o, k) => o[k], m);

const apiRequire = createRequire(new URL('../../api/package.json', import.meta.url));
apiRequire('dotenv/config');
const { PrismaClient } = apiRequire('@prisma/client');
const prisma = new PrismaClient();

const browser = await chromium.launch({ channel: 'chrome' });
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 860 };
const shot = (page, name, opts = {}) =>
  page.screenshot({ path: `${out}${name}.jpg`, type: 'jpeg', quality: 80, ...opts });

async function login(ctx, email) {
  const r = await ctx.request.post(`${api}/auth/login`, { data: { email, password: 'Demo1234!' } });
  if (!r.ok()) throw new Error(`login failed for ${email}: run "pnpm --filter api db:demo" first`);
}
const settle = async (page) => {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(700);
};

// ---- the customer, on a phone ----------------------------------------------------------------------------------
{
  const m = msg('ar');
  const ctx = await browser.newContext({ viewport: PHONE, locale: 'ar', deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`${base}/ar/b/demo-salon`);
  await settle(page);
  await shot(page, '01-public-page-ar');

  await page.goto(`${base}/ar/b/demo-salon/book`);
  await page
    .getByRole('button', { name: get(m, 'service.choose') })
    .first()
    .click();
  await page.getByRole('button', { name: get(m, 'common.next') }).click();
  await page.getByText(get(m, 'book.anyone'), { exact: true }).click();
  await page.getByRole('button', { name: get(m, 'common.next') }).click();
  for (let i = 2; i < 12; i++) {
    await page
      .getByRole('button', { name: get(m, 'booking.dateLabel') })
      .first()
      .click();
    const days = page.locator('td[data-day] button:not([disabled])');
    await days.nth(Math.min(i, (await days.count()) - 1)).click();
    await page.keyboard.press('Escape');
    const slot = page
      .getByRole('radiogroup', { name: get(m, 'booking.slotsLabel') })
      .getByRole('radio')
      .first();
    try {
      await slot.waitFor({ timeout: 3000 });
      await slot.click();
      break;
    } catch {
      /* closed day */
    }
  }
  await settle(page);
  await shot(page, '02-booking-slots-ar');
  await ctx.close();

  // The assistant (the scripted model answers; the French demo salon has the matching service names).
  const chatCtx = await browser.newContext({ viewport: PHONE, locale: 'ar', deviceScaleFactor: 2 });
  const chat = await chatCtx.newPage();
  await chat.goto(`${base}/ar/b/salon-nour`);
  await chat.getByRole('button', { name: get(m, 'b.chatOpen') }).click();
  await chat.getByLabel(get(m, 'chat.placeholder')).fill('أريد قص شعر غدا بعد الساعة 5 مساء');
  await chat.getByRole('button', { name: get(m, 'chat.send') }).click();
  await chat
    .getByRole('list', { name: new RegExp(get(m, 'chat.slotsLabel')) })
    .waitFor({ timeout: 10000 });
  await settle(chat);
  await shot(chat, '03-assistant-ar');
  await chatCtx.close();
}

// ---- deposit and review pages, in French ------------------------------------------------------------------------
{
  const m = msg('fr');
  const clinic = await prisma.business.findUniqueOrThrow({ where: { slug: 'demo-clinique' } });
  const service = await prisma.service.findFirstOrThrow({
    where: { businessId: clinic.id, depositAmount: { not: null } },
  });
  const staff = await prisma.staff.findFirstOrThrow({
    where: { businessId: clinic.id, services: { some: { serviceId: service.id } } },
  });
  const rq = await pwRequest.newContext({ baseURL: api });
  // an hour far enough in the future and unlikely to be taken
  const when = new Date(Date.now() + 20 * 86400000);
  const day = when.toISOString().slice(0, 10);
  const res = await rq.post('/public/bookings', {
    data: {
      businessSlug: 'demo-clinique',
      serviceId: service.id,
      staffId: staff.id,
      startsAt: `${day}T09:00:00.000Z`,
      customer: {
        name: 'Aminetou Mint Sidi',
        phone: `+2224${Math.floor(1000000 + Math.random() * 8999999)}`,
      },
      locale: 'fr',
    },
  });
  if (res.ok()) {
    const b = await res.json();
    const ctx = await browser.newContext({ viewport: PHONE, locale: 'fr', deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(`${base}/fr/booking/${b.cancelToken}`);
    await page.getByRole('heading', { name: get(m, 'deposit.title') }).waitFor();
    await settle(page);
    await shot(page, '04-deposit-fr');
    await ctx.close();
  } else
    console.log('skipped 04-deposit-fr:', res.status(), 'the slot is taken, run it again later');

  const visit = await prisma.booking.findFirst({
    where: { businessId: clinic.id, status: 'COMPLETED', review: null },
    orderBy: { startsAt: 'desc' },
  });
  if (visit) {
    const ctx = await browser.newContext({ viewport: PHONE, locale: 'fr', deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(`${base}/fr/review/${visit.reviewToken}`);
    await page.getByLabel('4 sur 5').check({ force: true });
    await page
      .getByLabel(get(m, 'reviewForm.comment'))
      .fill("Médecin à l'écoute, rendez-vous très pratique.");
    await settle(page);
    await shot(page, '05-review-fr');
    await ctx.close();
  }
}

// ---- the owner, on a computer -----------------------------------------------------------------------------------
for (const [locale, email, pages] of [
  [
    'fr',
    'demo.clinic@demo.mawid.test',
    [
      ['10-dashboard-fr', 'dashboard'],
      ['11-calendar-fr', 'dashboard/calendar'],
      ['12-payments-fr', 'dashboard/payments'],
      ['13-reviews-fr', 'dashboard/reviews'],
    ],
  ],
  [
    'ar',
    'demo.salon@demo.mawid.test',
    [
      ['20-dashboard-ar', 'dashboard'],
      ['21-calendar-ar', 'dashboard/calendar'],
    ],
  ],
]) {
  const ctx = await browser.newContext({ viewport: DESKTOP, locale });
  await login(ctx, email);
  const page = await ctx.newPage();
  for (const [name, path] of pages) {
    await page.goto(`${base}/${locale}/${path}`);
    await settle(page);
    await shot(page, name);
  }
  if (locale === 'fr') {
    await page.goto(`${base}/fr/dashboard/settings`);
    const qr = page.getByRole('img', { name: get(msg('fr'), 'shareCard.qrAlt') });
    await qr.waitFor();
    await qr.scrollIntoViewIfNeeded();
    await settle(page);
    await shot(page, '14-share-qr-fr');
  }
  await ctx.close();
}

// ---- the administrator --------------------------------------------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: DESKTOP, locale: 'fr' });
  await login(ctx, 'demo.admin@demo.mawid.test');
  const page = await ctx.newPage();
  await page.goto(`${base}/fr/admin`);
  await settle(page);
  await shot(page, '15-admin-fr');
  await ctx.close();
}

await prisma.$disconnect();
await browser.close();
console.log(`Screenshots written to ${out}`);
