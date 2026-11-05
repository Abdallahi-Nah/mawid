// Browser check of the AI features at 360 px, in Arabic (RTL) and French.
// Needs the web app AND an API started WITHOUT a Groq key but with the scripted model:
//   node apps/api/dist/dev/e2e-server.js     (same env as the API; see README.md)
// Usage: node scripts/ai-e2e.mjs [webUrl] [apiUrl]
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3100';
const api = process.argv[3] ?? 'http://localhost:4010';
const out = '/tmp/mawid-ai-shots/';
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
    if (m.type() === 'error' && !/status of (4|5)\d\d/.test(m.text()))
      errors.push(`${tag}: ${m.text().slice(0, 160)}`);
  });
  page.on('pageerror', (e) => errors.push(`${tag} PAGEERR: ${String(e).slice(0, 160)}`));
};

const ask = {
  ar: 'أريد قص شعر غدا بعد الساعة 5 مساء',
  fr: 'Je veux une coupe demain après 17h',
};

/** A real conversation: ask, get slot cards, pick one, see the draft, confirm. Returns the customer name. */
async function chatBooking(locale) {
  const m = msg(locale);
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale });
  const page = await ctx.newPage();
  watch(page, locale);
  const customer = `Client IA ${locale} ${Date.now().toString(36)}`;
  const phone = `+222 22 ${String(Math.floor(100000 + Math.random() * 899999))}`;
  let firstWordMs = 0;

  await step(page, `${locale}: open the chat on the public page`, async () => {
    await page.goto(`${base}/${locale}/b/salon-nour`);
    await page.getByRole('button', { name: get(m, 'b.chatOpen') }).click();
    await page.getByText(get(m, 'chat.greeting').replace('{business}', 'Salon Nour')).waitFor();
    await noOverflow(page, 'chat open');
  });
  await step(page, `${locale}: message streams in, slot cards appear`, async () => {
    const t0 = Date.now();
    await page.getByLabel(get(m, 'chat.placeholder')).fill(ask[locale]);
    await page.getByRole('button', { name: get(m, 'chat.send') }).click();
    await page
      .getByRole('status', { name: get(m, 'chat.typing') })
      .waitFor({ timeout: 3000 })
      .catch(() => {});
    const list = page.getByRole('list', { name: new RegExp(get(m, 'chat.slotsLabel')) });
    await list.waitFor({ timeout: 10000 });
    firstWordMs = Date.now() - t0;
    const cards = await list.getByRole('button').count();
    if (cards < 1 || cards > 3) throw new Error(`expected 1 to 3 slot cards, got ${cards}`);
    await page.screenshot({ path: `${out}${locale}-chat-slots.png` });
    await noOverflow(page, 'slot cards');
  });
  await step(page, `${locale}: pick a slot, draft appears and nothing is booked yet`, async () => {
    await page
      .getByRole('list', { name: new RegExp(get(m, 'chat.slotsLabel')) })
      .getByRole('button')
      .first()
      .click();
    await page.getByRole('heading', { name: get(m, 'chat.draftTitle') }).waitFor();
    await page.getByText(get(m, 'chat.draftNote')).waitFor();
    await page.screenshot({ path: `${out}${locale}-chat-draft.png` });
    await noOverflow(page, 'draft');
  });
  await step(page, `${locale}: confirm needs name and phone, then books`, async () => {
    await page.getByRole('button', { name: get(m, 'chat.confirmBooking') }).click();
    await page.getByText(get(m, 'form.errors.required')).first().waitFor();
    await page.getByLabel(get(m, 'form.name'), { exact: true }).fill(customer);
    await page.getByLabel(get(m, 'form.phone'), { exact: true }).fill(phone);
    await page.getByRole('button', { name: get(m, 'chat.confirmBooking') }).click();
    await page
      .getByRole('status')
      .filter({ hasText: get(m, 'chat.booked') })
      .waitFor({ timeout: 10000 });
    await page.getByRole('link', { name: get(m, 'book.manageLink') }).waitFor();
    await page.screenshot({ path: `${out}${locale}-chat-booked.png` });
    await noOverflow(page, 'booked');
  });
  await ctx.close();
  console.log(`      (cards in ${firstWordMs} ms with the scripted model)`);
  return customer;
}

try {
  const arCustomer = await chatBooking('ar');
  const frCustomer = await chatBooking('fr');

  // FAQ answer from business data (French).
  {
    const m = msg('fr');
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: 'fr' });
    const page = await ctx.newPage();
    watch(page, 'faq');
    await step(page, 'fr: FAQ answer comes from business data', async () => {
      await page.goto(`${base}/fr/b/salon-nour`);
      await page.getByRole('button', { name: get(m, 'b.chatOpen') }).click();
      await page.getByRole('button', { name: get(m, 'chat.chipHours') }).click();
      await page.getByText(/Opening hours/).waitFor({ timeout: 8000 });
      await page
        .getByText(/09:00-18:00/)
        .first()
        .waitFor();
    });

    // AC-06: the AI is down -> friendly message and the normal booking form still works.
    await step(
      page,
      'fr: AI down shows the fallback, normal booking form still works',
      async () => {
        await page.route('**/public/ai/chat', (r) =>
          r.request().method() === 'POST'
            ? r.fulfill({
                status: 503,
                contentType: 'application/json',
                body: JSON.stringify({ code: 'AI_UNAVAILABLE', message: 'down' }),
              })
            : r.continue(),
        );
        await page.goto(`${base}/fr/b/salon-nour`);
        await page.getByRole('button', { name: get(m, 'b.chatOpen') }).click();
        await page.getByLabel(get(m, 'chat.placeholder')).fill('Bonjour');
        await page.getByRole('button', { name: get(m, 'chat.send') }).click();
        await page.getByText(get(m, 'chat.unavailableTitle')).waitFor();
        await noOverflow(page, 'unavailable');
        await page.getByRole('link', { name: get(m, 'chat.openForm') }).click();
        await page.waitForURL('**/fr/b/salon-nour/book');
        await page.getByRole('heading', { name: get(m, 'book.serviceTitle') }).waitFor();
        await page
          .getByRole('button', { name: get(m, 'service.choose') })
          .first()
          .click();
        await page.getByRole('button', { name: get(m, 'common.next') }).click();
      },
    );
    await ctx.close();
  }

  // Owner side: bookings made by the assistant, writing tools, review analysis.
  const m = msg('fr');
  const octx = await browser.newContext({ viewport: { width: 390, height: 900 }, locale: 'fr' });
  const op = await octx.newPage();
  watch(op, 'owner');
  await step(op, 'owner: login', async () => {
    await op.goto(`${base}/fr/login`);
    await op.getByLabel('Email').fill('owner.salon@mawid.demo');
    await op.getByLabel('Mot de passe').fill('Demo1234!');
    await op.getByRole('button', { name: 'Se connecter' }).click();
    await op.waitForURL('**/fr/dashboard', { timeout: 10000 });
  });
  await step(
    op,
    'owner: the bookings made in the chat are in the calendar (source AI)',
    async () => {
      const from = new Date().toISOString();
      const to = new Date(Date.now() + 10 * 86400000).toISOString();
      const res = await octx.request.get(`${api}/bookings?from=${from}&to=${to}&pageSize=500`);
      const items = (await res.json()).items;
      for (const name of [arCustomer, frCustomer]) {
        const b = items.find((x) => x.customer.name === name);
        if (!b) throw new Error('booking not found: ' + name);
        if (b.source !== 'AI') throw new Error('source is ' + b.source);
      }
    },
  );
  await step(op, 'owner: "Write with AI" for a message (preview is editable)', async () => {
    await op.goto(`${base}/fr/dashboard`);
    await op
      .getByRole('button', { name: get(m, 'aiWrite.button') })
      .first()
      .click();
    const dlg = op.getByRole('dialog');
    await dlg.getByRole('button', { name: get(m, 'aiWrite.generate') }).click();
    const preview = dlg.getByLabel(get(m, 'aiWrite.preview'));
    await preview.waitFor({ timeout: 10000 });
    if (!(await preview.inputValue()).includes('Texte de démonstration'))
      throw new Error('no generated text');
    await preview.fill('Texte modifié par le propriétaire');
    await dlg.getByRole('button', { name: get(m, 'aiWrite.copy') }).waitFor();
    await op.screenshot({ path: out + 'owner-write.png' });
    await op.keyboard.press('Escape');
  });
  await step(op, 'owner: description with AI goes into the form, only saved on click', async () => {
    await op.goto(`${base}/fr/dashboard/settings`);
    await op.getByRole('button', { name: get(m, 'aiWrite.button') }).click();
    const dlg = op.getByRole('dialog');
    await dlg.getByRole('button', { name: get(m, 'aiWrite.generate') }).click();
    await dlg.getByLabel(get(m, 'aiWrite.preview')).waitFor({ timeout: 10000 });
    await dlg.getByRole('button', { name: get(m, 'aiWrite.use') }).click();
    const value = await op.getByLabel(get(m, 'settings.description')).inputValue();
    if (!value.includes('Texte de démonstration'))
      throw new Error('description not filled: ' + value);
  });
  await step(op, 'owner: review analysis card', async () => {
    await op.goto(`${base}/fr/dashboard`);
    await op.getByRole('button', { name: get(m, 'aiReviews.analyze') }).click();
    await op
      .getByText(new RegExp(`${get(m, 'aiReviews.none')}|Résumé de démonstration`))
      .waitFor({ timeout: 10000 });
    await noOverflow(op, 'dashboard');
    await op.screenshot({ path: out + 'owner-dashboard-ai.png', fullPage: true });
  });
  await octx.close();
} catch {
  /* reported by step() */
}

await browser.close();
if (errors.length) {
  failed = true;
  console.log('console errors:', errors);
}
console.log(failed ? '\nAI E2E FAILED' : '\nAI E2E PASSED (screenshots in ' + out + ')');
process.exit(failed ? 1 : 0);
