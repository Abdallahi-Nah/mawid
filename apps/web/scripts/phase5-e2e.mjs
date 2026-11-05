// End-to-end check of phase 5 in a real browser (360 px, Arabic RTL and French): real dashboard numbers and
// charts, CSV export, deposit flow, reviews, QR code, plan limit message, admin area and suspension.
// It builds its own data (new owners, services, past bookings) so the demo data is not needed.
// Needs the API (default http://localhost:4010) and the web app (default http://localhost:3100) running.
// Usage: node scripts/phase5-e2e.mjs [webUrl] [apiUrl]
import { chromium, request as pwRequest } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const base = process.argv[2] ?? 'http://localhost:3100';
const api = process.argv[3] ?? 'http://localhost:4010';
const out = '/tmp/mawid-p5-shots/';
mkdirSync(out, { recursive: true });
const msg = (l) =>
  JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), 'utf8'));
const get = (m, path) => path.split('.').reduce((o, k) => o[k], m);
const fr = msg('fr');
const ar = msg('ar');

// The API package has Prisma and argon2: used only to prepare data (past bookings, an admin account).
const apiRequire = createRequire(new URL('../../api/package.json', import.meta.url));
apiRequire('dotenv/config');
const { PrismaClient } = apiRequire('@prisma/client');
const argon2 = apiRequire('argon2');
const prisma = new PrismaClient();

const PASSWORD = 'Password123';
const stamp = Date.now().toString(36);
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const browser = await chromium.launch({ channel: 'chrome' });
const errors = [];
let failed = false;

const step = async (page, name, fn) => {
  try {
    await fn();
    console.log('OK  ', name);
  } catch (e) {
    failed = true;
    console.log('FAIL', name, '-', String(e).split('\n')[0].slice(0, 240));
    await page.screenshot({
      path: out + 'fail-' + name.replace(/\W+/g, '_') + '.png',
      fullPage: true,
    });
    throw e;
  }
};
const noOverflow = async (page, where) => {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (over > 1) throw new Error(`horizontal overflow of ${over}px at ${where}`);
};
const watch = (page, tag) => {
  page.on('console', (m) => {
    if (m.type() === 'error' && !/status of (4\d\d)/.test(m.text()))
      errors.push(`${tag}: ${m.text().slice(0, 160)}`);
  });
  page.on('pageerror', (e) => errors.push(`${tag} PAGEERR: ${String(e).slice(0, 160)}`));
};
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const at = (n, time) => new Date(`${day(n)}T${time}:00.000Z`);

// ---------------------------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------------------------
async function makeOwner(label, { pro = true } = {}) {
  const ctx = await pwRequest.newContext({ baseURL: api });
  const email = `p5.${label}.${stamp}@test.mawid`;
  const reg = await ctx.post('/auth/register', {
    data: { name: `Owner ${label}`, email, password: PASSWORD, terms: true, locale: 'fr' },
  });
  if (!reg.ok()) throw new Error('register failed ' + reg.status());
  const businessId = (await reg.json()).businessId;
  const slug = `p5-${label}-${stamp}`;
  const must = async (p) => {
    const r = await p;
    if (!r.ok()) throw new Error(`${r.url()} -> ${r.status()} ${await r.text()}`);
    return r.json();
  };
  await must(
    ctx.patch('/businesses/me', {
      data: {
        slug,
        name: `Salon ${label}`,
        timezone: 'UTC',
        defaultLocale: 'fr',
        paymentInstructions: 'Bankily 22 00 11 22',
      },
    }),
  );
  if (pro) await prisma.business.update({ where: { id: businessId }, data: { plan: 'PRO' } });
  const withDeposit = await must(
    ctx.post('/services', {
      data: { name: 'Coupe', durationMin: 30, price: 300, depositAmount: 100 },
    }),
  );
  const plain = await must(
    ctx.post('/services', { data: { name: 'Barbe', durationMin: 30, price: 500 } }),
  );
  const staff = await must(
    ctx.post('/staff', { data: { displayName: 'Sidi', serviceIds: [withDeposit.id, plain.id] } }),
  );
  await must(
    ctx.put(`/staff/${staff.id}/working-hours`, {
      data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        startTime: '09:00',
        endTime: '18:00',
      })),
    }),
  );
  return { ctx, email, businessId, slug, staffId: staff.id, withDeposit, plain };
}

let seq = 0;
async function insertBooking(
  o,
  { startsAt, status, price = 300, serviceId, name = 'Fatima Zahra' },
) {
  const customer = await prisma.customer.create({
    data: { businessId: o.businessId, name, phone: `+2225${String(1000000 + seq++)}`, email: null },
  });
  return prisma.booking.create({
    data: {
      businessId: o.businessId,
      customerId: customer.id,
      staffId: o.staffId,
      serviceId: serviceId ?? o.withDeposit.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      status,
      price,
      locale: 'fr',
    },
  });
}

async function publicBook(o, { startsAtDay = 6, time = '10:00', serviceId }) {
  const r = await o.ctx.post('/public/bookings', {
    data: {
      businessSlug: o.slug,
      serviceId: serviceId ?? o.withDeposit.id,
      staffId: o.staffId,
      startsAt: `${day(startsAtDay)}T${time}:00.000Z`,
      customer: { name: `Client ${time}`, phone: `+2226${String(1000000 + seq++)}` },
      locale: 'fr',
    },
  });
  if (!r.ok()) throw new Error('book failed ' + r.status() + ' ' + (await r.text()));
  return r.json();
}

async function loginBrowser(ctx, email) {
  const r = await ctx.request.post(`${api}/auth/login`, { data: { email, password: PASSWORD } });
  if (!r.ok()) throw new Error('login failed ' + r.status());
}

// ---------------------------------------------------------------------------------------------
let o1;
let o2;
let adminEmail;
let reviewBooking;
try {
  o1 = await makeOwner('main');
  // Two days ago: 2 COMPLETED + 1 CONFIRMED (barbe). Yesterday: CANCELLED, NO_SHOW, COMPLETED.
  await insertBooking(o1, { startsAt: at(-2, '10:00'), status: 'COMPLETED' });
  await insertBooking(o1, { startsAt: at(-2, '11:00'), status: 'COMPLETED' });
  await insertBooking(o1, {
    startsAt: at(-2, '14:00'),
    status: 'CONFIRMED',
    price: 500,
    serviceId: o1.plain.id,
  });
  await insertBooking(o1, { startsAt: at(-1, '10:00'), status: 'CANCELLED' });
  await insertBooking(o1, { startsAt: at(-1, '10:00'), status: 'NO_SHOW' });
  reviewBooking = await insertBooking(o1, {
    startsAt: at(-1, '15:00'),
    status: 'COMPLETED',
    name: 'Aïcha Mint Sidi',
  });
  o2 = await makeOwner('free', { pro: false });
  adminEmail = `p5.admin.${stamp}@test.mawid`;
  await prisma.user.create({
    data: {
      email: adminEmail,
      name: 'Admin P5',
      role: 'ADMIN',
      locale: 'fr',
      passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
    },
  });
  console.log('OK   data prepared (slug ' + o1.slug + ')');
} catch (e) {
  console.log('FAIL data setup -', String(e).slice(0, 300));
  await browser.close();
  process.exit(1);
}

try {
  for (const [locale, m] of [
    ['fr', fr],
    ['ar', ar],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale });
    const page = await ctx.newPage();
    watch(page, `owner-${locale}`);
    await loginBrowser(ctx, o1.email);

    await step(page, `${locale}: dashboard shows real numbers and charts (360 px)`, async () => {
      await page.goto(`${base}/${locale}/dashboard`);
      await page.getByText(get(m, 'home.revenue'), { exact: true }).waitFor();
      // 3 COMPLETED x 300 + 1 CONFIRMED x 500 = 1400
      await page
        .getByText(/1[\s  ,.]?400/)
        .first()
        .waitFor({ timeout: 8000 });
      await page.locator('svg.recharts-surface').first().waitFor();
      if ((await page.locator('svg.recharts-surface').count()) < 2)
        throw new Error('2 charts expected');
      const dir = await page.evaluate(() => document.documentElement.dir);
      if (dir !== (locale === 'ar' ? 'rtl' : 'ltr')) throw new Error('wrong dir ' + dir);
      await page.getByText(get(m, 'plan.names.PRO'), { exact: true }).first().waitFor();
      await noOverflow(page, 'dashboard');
      await page.screenshot({ path: `${out}${locale}-dashboard.png`, fullPage: true });
    });

    await step(page, `${locale}: bottom bar has "More" with the other pages`, async () => {
      const bar = page.locator('nav').filter({ hasText: get(m, 'dash.nav.more') });
      await bar.getByText(get(m, 'dash.nav.more'), { exact: true }).click();
      await page.getByRole('link', { name: get(m, 'dash.nav.settings') }).waitFor();
      await page.keyboard.press('Escape');
      await page.screenshot({ path: `${out}${locale}-nav.png` });
    });

    if (locale === 'fr') {
      await step(page, 'fr: CSV export downloads the bookings', async () => {
        const [dl] = await Promise.all([
          page.waitForEvent('download'),
          page.getByRole('button', { name: get(m, 'home.export') }).click(),
        ]);
        const text = readFileSync(await dl.path(), 'utf8');
        if (!text.includes('date,time,customer,phone,service,staff,status,source,price'))
          throw new Error('bad csv header');
        if (!text.includes('Aïcha Mint Sidi')) throw new Error('booking missing in csv');
      });
    }
    await ctx.close();
  }

  // -------------------------------------------------------------------------------------------
  // Deposit: the customer sends a proof, the owner validates (fr) or rejects (ar)
  // -------------------------------------------------------------------------------------------
  const b1 = await publicBook(o1, { time: '10:00' });
  const b2 = await publicBook(o1, { time: '11:00' });
  if (b1.status !== 'PENDING' || !b1.deposit) throw new Error('a deposit booking must be PENDING');

  for (const [locale, m, b] of [
    ['fr', fr, b1],
    ['ar', ar, b2],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale });
    const page = await ctx.newPage();
    watch(page, `customer-${locale}`);
    await step(page, `${locale}: customer sees the deposit and sends the proof`, async () => {
      await page.goto(`${base}/${locale}/booking/${b.cancelToken}`);
      await page.getByRole('heading', { name: get(m, 'deposit.title') }).waitFor();
      await page.getByText('Bankily 22 00 11 22').waitFor();
      await page.getByText(get(m, 'deposit.status.todo')).waitFor();
      await noOverflow(page, 'deposit section');
      await page.screenshot({ path: `${out}${locale}-deposit.png`, fullPage: true });
      // a click with nothing filled in gives a clear message
      await page.getByRole('button', { name: get(m, 'deposit.send') }).click();
      await page.getByText(get(m, 'deposit.needProof')).waitFor();
      await page.getByLabel(get(m, 'deposit.reference'), { exact: true }).fill(`BK-${locale}-4455`);
      await page
        .getByLabel(get(m, 'deposit.file'))
        .setInputFiles({ name: 'proof.png', mimeType: 'image/png', buffer: PNG });
      await page.getByRole('button', { name: get(m, 'deposit.send') }).click();
      await page.getByText(get(m, 'deposit.status.submitted')).waitFor({ timeout: 8000 });
      await noOverflow(page, 'deposit sent');
    });

    const octx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale });
    const op = await octx.newPage();
    watch(op, `owner-pay-${locale}`);
    await loginBrowser(octx, o1.email);
    await step(
      op,
      `${locale}: owner sees the proof and ${locale === 'fr' ? 'validates' : 'rejects'}`,
      async () => {
        await op.goto(`${base}/${locale}/dashboard/payments`);
        await op.getByRole('heading', { name: get(m, 'payments.title') }).waitFor();
        const card = op.getByRole('listitem').filter({ hasText: `BK-${locale}-4455` });
        await card.getByRole('img', { name: /./ }).first().waitFor();
        await noOverflow(op, 'payments page');
        await op.screenshot({ path: `${out}${locale}-payments.png`, fullPage: true });
        const action = locale === 'fr' ? 'validate' : 'reject';
        await card.getByRole('button', { name: get(m, `payments.${action}`) }).click();
        await op
          .getByRole('dialog')
          .getByRole('button', { name: get(m, `payments.${action}`) })
          .click();
        await op
          .getByText(get(m, locale === 'fr' ? 'payments.validated' : 'payments.rejected'))
          .first()
          .waitFor({ timeout: 8000 });
      },
    );
    await step(page, `${locale}: customer page shows the result`, async () => {
      await page.goto(`${base}/${locale}/booking/${b.cancelToken}`);
      await page
        .getByText(get(m, locale === 'fr' ? 'deposit.status.PAID' : 'deposit.status.FAILED'))
        .waitFor();
      if (locale === 'fr')
        await page.getByText(get(m, 'status.confirmed'), { exact: true }).first().waitFor();
      await noOverflow(page, 'deposit result');
    });
    await ctx.close();
    await octx.close();
  }

  // -------------------------------------------------------------------------------------------
  // Reviews
  // -------------------------------------------------------------------------------------------
  {
    const m = fr;
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: 'fr' });
    const page = await ctx.newPage();
    watch(page, 'review');
    await step(page, 'fr: rating page, 4 stars, then already rated', async () => {
      await page.goto(`${base}/fr/review/${reviewBooking.reviewToken}`);
      await page.getByRole('heading', { name: get(m, 'reviewForm.title') }).waitFor();
      await noOverflow(page, 'review page');
      await page.getByRole('button', { name: get(m, 'reviewForm.submit') }).click();
      await page.getByText(get(m, 'reviewForm.pickRating')).waitFor();
      await page.getByLabel('4 sur 5').check({ force: true });
      await page.getByLabel(get(m, 'reviewForm.comment')).fill('Très bon accueil');
      await page.screenshot({ path: `${out}fr-review.png`, fullPage: true });
      await page.getByRole('button', { name: get(m, 'reviewForm.submit') }).click();
      await page.getByText(get(m, 'reviewForm.thanksTitle')).waitFor({ timeout: 8000 });
      await page.reload();
      await page.getByText(get(m, 'reviewForm.alreadyTitle')).waitFor();
    });
    await step(page, 'fr: an unknown review link says so', async () => {
      await page.goto(`${base}/fr/review/${crypto.randomUUID()}`);
      await page.getByText(get(m, 'reviewForm.invalidTitle')).waitFor();
    });
    await ctx.close();

    const octx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: 'fr' });
    const op = await octx.newPage();
    watch(op, 'owner-reviews');
    await loginBrowser(octx, o1.email);
    await step(op, 'fr: owner replies to the review', async () => {
      await op.goto(`${base}/fr/dashboard/reviews`);
      await op.getByText('Très bon accueil').waitFor();
      await noOverflow(op, 'reviews page');
      await op.getByRole('button', { name: get(m, 'reviewsPage.reply') }).click();
      await op.getByLabel(get(m, 'reviewsPage.replyLabel')).fill('Merci Aïcha, à bientôt !');
      await op.getByRole('button', { name: get(m, 'reviewsPage.send') }).click();
      await op.getByText(get(m, 'reviewsPage.replied')).first().waitFor({ timeout: 8000 });
      await op.screenshot({ path: `${out}fr-reviews.png`, fullPage: true });
    });
    await octx.close();

    for (const [locale, mm] of [
      ['fr', fr],
      ['ar', ar],
    ]) {
      const pctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale });
      const pp = await pctx.newPage();
      watch(pp, `public-${locale}`);
      await step(
        pp,
        `${locale}: public page shows the average, the review and the reply`,
        async () => {
          await pp.goto(`${base}/${locale}/b/${o1.slug}`);
          await pp
            .getByText(/4.*5.*1/)
            .first()
            .waitFor();
          await pp.getByText('Très bon accueil').waitFor();
          await pp.getByText('Merci Aïcha, à bientôt !').waitFor();
          await pp.getByText(get(mm, 'b.ownerReply')).waitFor();
          await pp.getByText('Aïcha M.').waitFor(); // never the full name
          await noOverflow(pp, 'public page');
          await pp.screenshot({ path: `${out}${locale}-public.png`, fullPage: true });
        },
      );
      await pctx.close();
    }
  }

  // -------------------------------------------------------------------------------------------
  // Settings: QR code, buffer, payment instructions; plan limit message
  // -------------------------------------------------------------------------------------------
  {
    const m = fr;
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: 'fr' });
    const page = await ctx.newPage();
    watch(page, 'settings');
    await loginBrowser(ctx, o1.email);
    await step(page, 'fr: settings has the QR code, the buffer and the payment text', async () => {
      await page.goto(`${base}/fr/dashboard/settings`);
      const qr = page.getByRole('img', { name: get(m, 'shareCard.qrAlt') });
      await qr.waitFor({ timeout: 10000 });
      const ok = await qr.evaluate(
        (img) => img.naturalWidth > 0 && img.src.startsWith('data:image/png'),
      );
      if (!ok) throw new Error('QR code did not load');
      const href = await page
        .getByRole('link', { name: get(m, 'shareCard.download') })
        .getAttribute('href');
      if (!href?.startsWith('data:image/png')) throw new Error('bad QR download link');
      await page.getByLabel(get(m, 'settings.buffer')).fill('10');
      await page.getByLabel(get(m, 'settings.paymentInstructions')).fill('Masrvi 33 44 55 66');
      await page.getByRole('button', { name: get(m, 'common.save') }).click();
      await page.getByText(get(m, 'common.saved')).first().waitFor();
      await noOverflow(page, 'settings');
      await page.screenshot({ path: `${out}fr-settings.png`, fullPage: true });
    });
    await ctx.close();

    // FREE owner: the third employee is refused, with the upgrade message.
    const fctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: 'fr' });
    const fp = await fctx.newPage();
    watch(fp, 'free');
    await loginBrowser(fctx, o2.email);
    const second = await o2.ctx.post('/staff', { data: { displayName: 'Deux', serviceIds: [] } });
    if (!second.ok()) throw new Error('second staff should be allowed on FREE');
    await step(fp, 'fr: FREE plan, the 3rd employee shows the upgrade message', async () => {
      await fp.goto(`${base}/fr/dashboard/staff`);
      await fp
        .getByRole('button', { name: get(m, 'staffPage.add') })
        .first()
        .click();
      const dlg = fp.getByRole('dialog');
      await dlg.getByLabel(get(m, 'form.name'), { exact: true }).fill('Trois');
      await dlg.getByRole('button', { name: get(m, 'common.save') }).click();
      await dlg.getByText(get(m, 'apiErrors.PLAN_LIMIT_STAFF')).waitFor({ timeout: 8000 });
      await fp.screenshot({ path: `${out}fr-plan-limit.png` });
      await fp.keyboard.press('Escape');
      await fp.goto(`${base}/fr/dashboard`);
      await fp.getByText(get(m, 'plan.upgradeTitle')).waitFor({ timeout: 8000 });
      await noOverflow(fp, 'dashboard FREE');
      await fp.screenshot({ path: `${out}fr-plan-card.png`, fullPage: true });
    });
    await fctx.close();
  }

  // -------------------------------------------------------------------------------------------
  // Admin
  // -------------------------------------------------------------------------------------------
  for (const [locale, m, viewport] of [
    ['fr', fr, { width: 360, height: 800 }],
    ['ar', ar, { width: 1280, height: 900 }],
  ]) {
    const ctx = await browser.newContext({ viewport, locale });
    const page = await ctx.newPage();
    watch(page, `admin-${locale}`);
    await step(page, `${locale}: admin logs in and lands on the admin area`, async () => {
      await page.goto(`${base}/${locale}/login`);
      await page.getByLabel(get(m, 'auth.email'), { exact: true }).fill(adminEmail);
      await page.getByLabel(get(m, 'auth.password'), { exact: true }).fill(PASSWORD);
      await page.getByRole('button', { name: get(m, 'auth.loginCta') }).click();
      await page.waitForURL(new RegExp(`/${locale}/admin`), { timeout: 10000 });
      await page.getByRole('heading', { name: get(m, 'admin.title') }).waitFor();
      await noOverflow(page, 'admin');
    });
    await step(
      page,
      `${locale}: admin finds the business, suspends it, the public page closes, then reactivates`,
      async () => {
        await page.getByLabel(get(m, 'admin.search'), { exact: true }).fill(o1.slug);
        const row = page.getByRole('listitem').filter({ hasText: `/b/${o1.slug}` });
        await row.waitFor({ timeout: 8000 });
        await page.screenshot({ path: `${out}${locale}-admin.png`, fullPage: true });
        await row.getByRole('button', { name: get(m, 'admin.suspend'), exact: true }).click();
        await page
          .getByRole('dialog')
          .getByRole('button', { name: get(m, 'admin.suspend'), exact: true })
          .click();
        await page.getByText(get(m, 'admin.suspended')).first().waitFor({ timeout: 8000 });

        const gone = await ctx.request.get(`${base}/${locale}/b/${o1.slug}`);
        if (gone.status() !== 404)
          throw new Error('public page should be 404, got ' + gone.status());
        const owner = await o1.ctx.get('/services');
        if (owner.status() !== 403)
          throw new Error('owner should be blocked, got ' + owner.status());

        await row.getByRole('button', { name: get(m, 'admin.reactivate'), exact: true }).click();
        await page
          .getByRole('dialog')
          .getByRole('button', { name: get(m, 'admin.reactivate'), exact: true })
          .click();
        await page.getByText(get(m, 'admin.reactivated')).first().waitFor({ timeout: 8000 });
        const back = await ctx.request.get(`${base}/${locale}/b/${o1.slug}`);
        if (back.status() !== 200)
          throw new Error('public page should be back, got ' + back.status());
      },
    );
    await ctx.close();
  }

  // An owner can not open the admin area.
  {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: 'fr' });
    const page = await ctx.newPage();
    await loginBrowser(ctx, o1.email);
    await step(page, 'fr: an owner can not use the admin area', async () => {
      await page.goto(`${base}/fr/admin`);
      await page.getByText(get(fr, 'auth.forbiddenTitle')).waitFor({ timeout: 8000 });
    });
    await ctx.close();
  }
} catch {
  /* already reported by step() */
}

// Clean the data of this run.
await prisma.user
  .deleteMany({ where: { email: { contains: `.${stamp}@test.mawid` } } })
  .catch(() => undefined);
await prisma.business
  .deleteMany({ where: { slug: { in: [o1?.slug, o2?.slug].filter(Boolean) } } })
  .catch(() => undefined);
await prisma.$disconnect();
await browser.close();
if (errors.length) {
  failed = true;
  console.log('console errors:', errors);
}
console.log(failed ? '\nE2E FAILED' : '\nE2E PASSED (screenshots in ' + out + ')');
process.exit(failed ? 1 : 0);
