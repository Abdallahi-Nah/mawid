// End-to-end check of a real booking in Arabic (RTL) and French at 360 px, then the owner side
// (calendar, drag and drop, status, customers, bell). Needs API + web running and `pnpm --filter api db:seed`.
// Usage: node scripts/booking-e2e.mjs [webUrl]
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3100';
const out = '/tmp/mawid-e2e-shots/';
mkdirSync(out, { recursive: true });
const msg = (l) =>
  JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), 'utf8'));
const get = (m, path) => path.split('.').reduce((o, k) => o[k], m);

const browser = await chromium.launch({ channel: 'chrome' });
const errors = [];
let failed = false;

const step = async (page, name, fn) => {
  try {
    await fn();
    console.log('OK  ', name);
  } catch (e) {
    failed = true;
    console.log('FAIL', name, '-', String(e).split('\n')[0].slice(0, 220));
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
    // 4xx answers (SLOT_TAKEN...) are expected in some steps; real code errors are not.
    if (m.type() === 'error' && !/status of 4\d\d/.test(m.text()))
      errors.push(`${tag}: ${m.text().slice(0, 160)}`);
  });
  page.on('pageerror', (e) => errors.push(`${tag} PAGEERR: ${String(e).slice(0, 160)}`));
};

/** Pick the first day (after today) that has free slots, then the first slot. Returns nothing. */
async function pickDayAndSlot(page, m, tryFrom = 3) {
  for (let i = tryFrom; i < tryFrom + 12; i++) {
    await page
      .getByRole('button', { name: get(m, 'booking.dateLabel'), exact: true })
      .first()
      .click();
    const days = page.locator('td[data-day] button:not([disabled])');
    const n = await days.count();
    if (i >= n) throw new Error('no more days to try');
    await days.nth(i).click();
    await page.keyboard.press('Escape');
    const slot = page
      .getByRole('radiogroup', { name: get(m, 'booking.slotsLabel') })
      .getByRole('radio')
      .first();
    try {
      await slot.waitFor({ timeout: 4000 });
      await slot.click();
      return i;
    } catch {
      /* closed day: try the next one */
    }
  }
  throw new Error('no day with free slots found');
}

async function bookOnce(locale, { reschedule }) {
  const m = msg(locale);
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale });
  const page = await ctx.newPage();
  watch(page, locale);
  let startsAt = '';
  page.on('response', async (r) => {
    if (r.url().endsWith('/public/bookings') && r.request().method() === 'POST' && r.ok())
      startsAt = (await r.json()).startsAt;
  });
  const customer = `Client E2E ${locale} ${Date.now().toString(36)}`;
  const phone = `+222 22 ${String(Math.floor(100000 + Math.random() * 899999))}`;
  let manageUrl = '';

  await step(page, `${locale}: booking page opens (dir, no overflow)`, async () => {
    await page.goto(`${base}/${locale}/b/salon-nour/book`);
    await page.getByRole('heading', { name: get(m, 'book.serviceTitle') }).waitFor();
    const dir = await page.evaluate(() => document.documentElement.dir);
    if (dir !== (locale === 'ar' ? 'rtl' : 'ltr')) throw new Error('wrong dir ' + dir);
    await noOverflow(page, 'service step');
  });
  await step(page, `${locale}: service, any employee`, async () => {
    await page
      .getByRole('button', { name: get(m, 'service.choose') })
      .first()
      .click();
    await page.getByRole('button', { name: get(m, 'common.next') }).click();
    await page.getByText(get(m, 'book.anyone'), { exact: true }).click();
    await noOverflow(page, 'staff step');
    await page.getByRole('button', { name: get(m, 'common.next') }).click();
  });
  await step(page, `${locale}: date and real slot`, async () => {
    await pickDayAndSlot(page, m);
    await page.screenshot({ path: `${out}${locale}-slots.png`, fullPage: true });
    await noOverflow(page, 'slots step');
    await page.getByRole('button', { name: get(m, 'common.next') }).click();
  });
  await step(page, `${locale}: details validation, then confirm`, async () => {
    await page.getByRole('button', { name: get(m, 'book.confirm') }).click();
    await page.getByText(get(m, 'form.errors.required')).first().waitFor();
    await page.getByLabel(get(m, 'form.name'), { exact: true }).fill(customer);
    await page.getByLabel(get(m, 'form.phone'), { exact: true }).fill(phone);
    await page
      .getByLabel(get(m, 'form.emailOptional'), { exact: true })
      .fill(`e2e.${Date.now()}@test.mawid`);
    await page.getByRole('button', { name: get(m, 'book.confirm') }).click();
    await page
      .getByRole('status')
      .filter({ hasText: get(m, 'book.successTitle') })
      .waitFor({ timeout: 10000 });
    await page.screenshot({ path: `${out}${locale}-confirmed.png`, fullPage: true });
    await noOverflow(page, 'confirmation');
    if (!startsAt) throw new Error('no booking response seen');
  });
  await step(page, `${locale}: calendar links on the confirmation`, async () => {
    const ics = await page.getByRole('link', { name: get(m, 'book.icsFile') }).getAttribute('href');
    const res = await ctx.request.get(ics);
    if (!res.ok() || !(await res.text()).includes('BEGIN:VCALENDAR')) throw new Error('bad ics');
    await page.getByRole('link', { name: 'Google' }).waitFor();
    manageUrl = new URL(
      await page.getByRole('link', { name: get(m, 'book.manageLink') }).getAttribute('href'),
      base,
    ).href;
  });
  await step(page, `${locale}: manage page shows the booking`, async () => {
    await page.goto(manageUrl);
    await page.getByRole('heading', { name: get(m, 'manage.title') }).waitFor();
    await noOverflow(page, 'manage page');
    await page.screenshot({ path: `${out}${locale}-manage.png`, fullPage: true });
  });
  if (reschedule) {
    await step(page, `${locale}: reschedule`, async () => {
      await page.getByRole('button', { name: get(m, 'manage.reschedule') }).click();
      await pickDayAndSlot(page, m, 5);
      await page.getByRole('button', { name: get(m, 'manage.confirmNew') }).click();
      await page.getByText(get(m, 'manage.rescheduled')).first().waitFor({ timeout: 8000 });
    });
  }
  return { ctx, page, m, customer, manageUrl, startsAt };
}

async function cancelByLink({ page, m, manageUrl, ctx, locale }) {
  await step(page, `${locale}: cancel from the link`, async () => {
    await page.goto(manageUrl);
    await page.getByRole('button', { name: get(m, 'manage.cancel') }).click();
    await page.getByRole('button', { name: get(m, 'manage.cancelConfirm') }).click();
    await page
      .getByRole('status')
      .filter({ hasText: get(m, 'status.cancelled') })
      .waitFor({ timeout: 8000 });
    await noOverflow(page, 'after cancel');
  });
  await ctx.close();
}

try {
  // 1. Arabic: book, reschedule, cancel.
  const ar = await bookOnce('ar', { reschedule: true });
  await cancelByLink({ ...ar, locale: 'ar' });

  // 2. French: book, owner side, then cancel.
  const fr = await bookOnce('fr', { reschedule: false });
  const m = fr.m;
  const octx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr' });
  const op = await octx.newPage();
  watch(op, 'owner');
  await step(op, 'owner: login', async () => {
    await op.goto(`${base}/fr/login`);
    await op.getByLabel('Email').fill('owner.salon@mawid.demo');
    await op.getByLabel('Mot de passe').fill('Demo1234!');
    await op.getByRole('button', { name: 'Se connecter' }).click();
    await op.waitForURL('**/fr/dashboard', { timeout: 10000 });
  });
  await step(op, 'owner: booking visible in the calendar (week view)', async () => {
    await op.goto(`${base}/fr/dashboard/calendar`);
    await op.getByRole('heading', { name: get(m, 'cal.title') }).waitFor();
    const target = new Date(fr.startsAt);
    for (let i = 0; i < 12; i++) {
      await op.waitForLoadState('networkidle');
      if (await op.getByRole('button', { name: new RegExp(fr.customer.split(' ').pop()) }).count())
        break;
      await op.getByRole('button', { name: get(m, 'cal.next'), exact: true }).click();
      await op.waitForTimeout(400);
    }
    await op
      .getByRole('button', { name: new RegExp(fr.customer.split(' ').pop()) })
      .first()
      .waitFor({ timeout: 5000 });
    void target;
  });
  await step(op, 'owner: day view, drag and drop to another time', async () => {
    const ev = op.getByRole('button', { name: new RegExp(fr.customer.split(' ').pop()) }).first();
    // open the day of this booking: the day card button is the one just above it
    const card = op.locator('div.grid > div').filter({ has: ev }).first();
    await card.getByRole('button', { name: /Ouvrir le/ }).click();
    const dayEv = op
      .getByRole('button', { name: new RegExp(fr.customer.split(' ').pop()) })
      .first();
    await dayEv.waitFor();
    const col = op.locator('[data-column]').filter({ has: dayEv }).first();
    const moved = op.waitForResponse(
      (r) => /\/bookings\/[0-9a-f-]+$/.test(r.url()) && r.request().method() === 'PATCH',
    );
    // Real mouse moves in small steps: the browser only starts an HTML5 drag after some movement.
    const from = await dayEv.boundingBox();
    const to = await col.boundingBox();
    await op.mouse.move(from.x + 20, from.y + 8);
    await op.mouse.down();
    await op.mouse.move(from.x + 25, from.y + 30, { steps: 5 });
    await op.mouse.move(to.x + 40, to.y + 400, { steps: 15 });
    await op.mouse.up();
    const res = await moved;
    if (res.status() !== 200)
      throw new Error('move answered ' + res.status() + ' ' + (await res.text()));
    await op.getByText(get(m, 'cal.moved')).first().waitFor();
    await op.screenshot({ path: out + 'owner-day-moved.png', fullPage: true });
  });
  await step(op, 'owner: detail dialog, confirm status', async () => {
    await op
      .getByRole('button', { name: new RegExp(fr.customer.split(' ').pop()) })
      .first()
      .click();
    const dlg = op.getByRole('dialog');
    await dlg.getByText(fr.customer).waitFor();
    const confirm = dlg.getByRole('button', { name: get(m, 'cal.action.CONFIRMED') });
    if (await confirm.count()) await confirm.click();
    await dlg.getByText(get(m, 'status.confirmed'), { exact: true }).waitFor({ timeout: 6000 });
    await op.keyboard.press('Escape');
  });
  await step(op, 'owner: manual booking', async () => {
    await op.getByRole('button', { name: get(m, 'cal.new') }).click();
    const dlg = op.getByRole('dialog');
    await dlg.getByLabel(get(m, 'steps.service')).click();
    await op.getByRole('option').first().click();
    await dlg.getByLabel(get(m, 'book.with')).click();
    await op.getByRole('option').first().click();
    const d = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    await dlg.getByLabel(get(m, 'booking.dateLabel')).fill(d);
    await dlg.getByLabel(get(m, 'cal.time')).fill('11:30');
    await dlg.getByLabel(get(m, 'form.name'), { exact: true }).fill('Walk In E2E');
    await dlg.getByLabel(get(m, 'form.phone'), { exact: true }).fill('+222 33 445566');
    await dlg.getByRole('button', { name: get(m, 'cal.create') }).click();
    await op.getByText(get(m, 'cal.created')).first().waitFor({ timeout: 8000 });
  });
  await step(op, 'owner: customers list, search and detail', async () => {
    await op.goto(`${base}/fr/dashboard/customers`);
    await op.getByPlaceholder(get(m, 'customers.search')).fill(fr.customer.split(' ').pop());
    await op
      .getByRole('link', { name: new RegExp(fr.customer) })
      .first()
      .click();
    await op.getByRole('heading', { name: fr.customer }).waitFor();
    await op.getByLabel(get(m, 'customers.notes')).fill('Note e2e');
    await op.getByRole('button', { name: get(m, 'common.save') }).click();
    await op.getByText(get(m, 'common.saved')).first().waitFor();
  });
  await step(op, 'owner: notification bell shows the new booking', async () => {
    await op.goto(`${base}/fr/dashboard`);
    await op.getByRole('button', { name: /Notifications/ }).click();
    await op.getByText(new RegExp('Nouvelle réservation de')).first().waitFor({ timeout: 8000 });
    await op.screenshot({ path: out + 'owner-bell.png' });
  });
  await step(op, 'owner: settings show the new fields', async () => {
    await op.goto(`${base}/fr/dashboard/settings`);
    await op.getByLabel(get(m, 'settings.minNotice')).waitFor();
    await op.getByLabel(get(m, 'settings.maxDaysAhead')).waitFor();
  });
  await octx.close();
  await cancelByLink({ ...fr, locale: 'fr' });
} catch {
  /* already reported by step() */
}

await browser.close();
if (errors.length) {
  failed = true;
  console.log('console errors:', errors);
}
console.log(failed ? '\nE2E FAILED' : '\nE2E PASSED (screenshots in ' + out + ')');
process.exit(failed ? 1 : 0);
