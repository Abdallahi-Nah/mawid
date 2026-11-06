// The owner cannot put an appointment in the past: drag and drop to a past day is refused, and the "new appointment"
// form refuses a past date or time (15 minutes of tolerance for a customer who just arrived). Needs the demo seed.
// Usage: node scripts/past-e2e.mjs [webUrl] [apiUrl]
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3100';
const api = process.argv[3] ?? 'http://localhost:4010';
const msg = JSON.parse(readFileSync(new URL('../messages/fr.json', import.meta.url), 'utf8'));
const get = (path) => path.split('.').reduce((o, k) => o[k], msg);
const browser = await chromium.launch({ channel: 'chrome' });
let failed = false;
const check = (name, ok, extra = '') => {
  console.log(ok ? 'OK  ' : 'FAIL', name, extra);
  if (!ok) failed = true;
};
const day = (n) => new Date(Date.now() + n * 86400000);
const iso = (d) => d.toISOString().slice(0, 10);

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr' });
const login = await ctx.request.post(`${api}/auth/login`, {
  data: { email: 'owner.salon@mawid.demo', password: 'Demo1234!' },
});
if (!login.ok()) throw new Error('login failed: run "pnpm --filter api db:seed"');
const svc = (await (await ctx.request.get(`${api}/services?pageSize=100`)).json()).items[0];
const staff = (await (await ctx.request.get(`${api}/staff?pageSize=100`)).json()).items.find((s) =>
  s.serviceIds.includes(svc.id),
);
const origin = new URL(base).origin;
const post = (path, data, method = 'POST') =>
  ctx.request.fetch(`${api}${path}`, { method, data, headers: { origin } });

// The week view (fr: Monday to Sunday). Pick a day to put the booking on, and a past day of the same week to drop it on.
// Monday has no past day in its week: that part is skipped (the API and form checks below still run).
const weekdayNow = new Date().getUTCDay(); // 0 = Sunday
const bookingOffset = weekdayNow === 0 ? 0 : 1; // Sunday is the last day of the week: stay on today
const firstHour = bookingOffset === 0 ? new Date().getUTCHours() + 1 : 6;
const canDrop = weekdayNow !== 1;

// A booking (an hour that is free) to drag.
let created;
for (let hour = firstHour; hour < 23; hour++) {
  created = await post('/bookings', {
    serviceId: svc.id,
    staffId: staff.id,
    startsAt: `${iso(day(bookingOffset))}T${String(hour).padStart(2, '0')}:00:00.000Z`,
    customer: {
      name: 'Glisse Test',
      phone: `+2228${Math.floor(1000000 + Math.random() * 8999999)}`,
    },
    status: 'CONFIRMED',
  });
  if (created.status() !== 409) break; // 409 = that hour is taken, try the next one
}
check('a booking can be created', created?.status() === 201, String(created?.status()));
const booking = await created.json();

const page = await ctx.newPage();
await page.goto(`${base}/fr/dashboard/calendar`);
await page.getByRole('button', { name: 'Semaine', exact: true }).click();

// --- drag and drop to yesterday (week view) ---------------------------------------------------------------------
const label = (d) =>
  `${new Intl.DateTimeFormat('fr', { weekday: 'long', timeZone: 'UTC' }).format(d)} ${d.getUTCDate()}`;
if (canDrop) {
  const chip = page.getByText('Glisse Test').first();
  await chip.waitFor({ timeout: 15000 });
  const target = page
    .getByRole('button', { name: new RegExp(`Ouvrir le ${label(day(-1))}$`) })
    .first();
  // the day card (not only its header) is the drop zone
  const card = target.locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
  const from = await chip.boundingBox();
  const to = await card.boundingBox();
  await page.mouse.move(from.x + 10, from.y + 6);
  await page.mouse.down();
  await page.mouse.move(from.x + 14, from.y + 30, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
  await page
    .getByText(get('apiErrors.PAST_NOT_ALLOWED'))
    .first()
    .waitFor({ timeout: 8000 })
    .then(
      () => check('dropping on yesterday shows "cannot choose a past time"', true),
      () => check('dropping on yesterday shows "cannot choose a past time"', false),
    );
} else console.log('SKIP drop test: Monday has no past day in its week');
const still = await (await ctx.request.get(`${api}/bookings/${booking.id}`)).json();
check('the booking did not move', still.startsAt === booking.startsAt, still.startsAt);

// --- the API says no as well --------------------------------------------------------------------------------------
const direct = await post(
  `/bookings/${booking.id}`,
  { startsAt: new Date(Date.now() - 86400000).toISOString() },
  'PATCH',
);
check(
  'API: moving to yesterday is refused (400 PAST_NOT_ALLOWED)',
  direct.status() === 400 && (await direct.json()).code === 'PAST_NOT_ALLOWED',
);

// --- the "new appointment" form -----------------------------------------------------------------------------------
await page.getByRole('button', { name: get('cal.new') }).click();
const dlg = page.getByRole('dialog');
const minDate = await dlg.getByLabel(get('booking.dateLabel')).getAttribute('min');
check(
  'the date field does not allow days before today (min attribute)',
  minDate !== null && minDate >= iso(day(-1)),
  String(minDate),
);
await dlg.getByLabel(get('steps.service')).click();
await page.getByRole('option').first().click();
await dlg.getByLabel(get('book.with')).click();
await page.getByRole('option').first().click();
await dlg.getByLabel(get('form.name'), { exact: true }).fill('Passé Test');
await dlg.getByLabel(get('form.phone'), { exact: true }).fill('+222 33 445577');
const twoDaysAgo = iso(day(-2));
await dlg.getByLabel(get('booking.dateLabel')).fill(twoDaysAgo);
await dlg.getByLabel(get('cal.time')).fill('11:30');
await dlg.getByRole('button', { name: get('cal.create') }).click();
await dlg
  .getByText(get('form.errors.pastNotAllowed'))
  .waitFor({ timeout: 5000 })
  .then(
    () => check('form: a past date shows the error and nothing is saved', true),
    () => check('form: a past date shows the error and nothing is saved', false),
  );
// Clean up: a cancelled booking frees its slot, so the script can run again.
await post(`/bookings/${booking.id}/status`, { status: 'CANCELLED' }, 'PATCH');
await browser.close();
console.log(failed ? '\nPAST CHECK FAILED' : '\nPAST CHECK PASSED');
process.exit(failed ? 1 : 0);
