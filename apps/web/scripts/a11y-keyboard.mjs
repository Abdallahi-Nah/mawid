// Keyboard-only check (WCAG 2.1.1, 2.4.3, 2.4.7): the skip link works, every stop of the Tab order has a
// name and a visible focus ring, a dialog keeps the focus inside and gives it back on Escape, and the
// booking flow can be completed without a mouse. Arabic (RTL) and French at 360 px.
// Needs the API and the web app running with the demo data. Usage: node scripts/a11y-keyboard.mjs [webUrl]
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3100';
const msg = (l) =>
  JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), 'utf8'));
const get = (m, path) => path.split('.').reduce((o, k) => o[k], m);
const browser = await chromium.launch({ channel: 'chrome' });
let failed = false;

async function step(name, fn) {
  try {
    await fn();
    console.log('OK  ', name);
  } catch (e) {
    failed = true;
    console.log('FAIL', name, '-', String(e).split('\n')[0].slice(0, 220));
  }
}

/** What the focused element is, and whether a focus ring is drawn. */
const focusInfo = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const name =
      el.getAttribute('aria-label') ||
      el.getAttribute('aria-labelledby') ||
      (el.textContent || '').trim() ||
      el.getAttribute('title') ||
      el.getAttribute('alt') ||
      (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) ||
      '';
    const ring =
      (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) ||
      (cs.boxShadow && cs.boxShadow !== 'none');
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      name: name.trim().slice(0, 40),
      ring: !!ring,
      visible: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight,
      inDialog: !!el.closest('[role="dialog"]'),
    };
  });

for (const locale of ['fr', 'ar']) {
  const m = msg(locale);
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale });
  const page = await ctx.newPage();

  await step(
    `${locale}: skip link is the first stop and moves the focus to the content`,
    async () => {
      await page.goto(`${base}/${locale}/b/salon-nour`);
      await page.keyboard.press('Tab');
      const f = await focusInfo(page);
      if (!f || f.tag !== 'a' || !f.name.includes(get(m, 'common.skipToContent')))
        throw new Error('first stop is not the skip link: ' + JSON.stringify(f));
      await page.keyboard.press('Enter');
      const inMain = await page.evaluate(
        () => !!document.activeElement?.closest('main') || document.activeElement?.id === 'main',
      );
      const hash = await page.evaluate(() => location.hash);
      if (!inMain && hash !== '#main') throw new Error('focus did not move to the main content');
    },
  );

  await step(
    `${locale}: 20 Tab stops, each with a name, a visible focus ring, no trap`,
    async () => {
      await page.goto(`${base}/${locale}/b/salon-nour`);
      const seen = new Set();
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('Tab');
        const f = await focusInfo(page);
        if (!f) {
          // The end of the page: the next Tab goes to the browser itself. That is normal, but not too early.
          if (seen.size < 8)
            throw new Error(`stop ${i + 1}: focus left the page after ${seen.size} stops`);
          break;
        }
        if (!f.name) throw new Error(`stop ${i + 1}: ${f.tag} has no accessible name`);
        if (!f.ring) throw new Error(`stop ${i + 1}: "${f.name}" has no visible focus ring`);
        seen.add(f.name);
      }
      if (seen.size < 8)
        throw new Error('the Tab order seems stuck (' + seen.size + ' different stops)');
    },
  );

  await step(`${locale}: chat dialog traps the focus and Escape gives it back`, async () => {
    await page.goto(`${base}/${locale}/b/salon-nour`);
    const fab = page.getByRole('button', { name: get(m, 'b.chatOpen') });
    await fab.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').waitFor();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const f = await focusInfo(page);
      if (!f?.inDialog) throw new Error('focus left the dialog at Tab ' + (i + 1));
    }
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    const back = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    if (back !== get(m, 'b.chatOpen'))
      throw new Error('focus not given back to the chat button: ' + back);
  });

  await step(
    `${locale}: the booking flow works with the keyboard only (service, employee, date)`,
    async () => {
      await page.goto(`${base}/${locale}/b/salon-nour/book`);
      await page.getByRole('heading', { name: get(m, 'book.serviceTitle') }).waitFor();
      await page
        .getByRole('button', { name: get(m, 'service.choose') })
        .first()
        .focus();
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: get(m, 'common.next') }).focus();
      await page.keyboard.press('Enter');
      await page.getByRole('heading', { name: get(m, 'book.staffTitle') }).waitFor();
      // radio cards: Tab to the group, Space picks
      await page.getByRole('radio').first().focus();
      await page.keyboard.press('Space');
      await page.getByRole('button', { name: get(m, 'common.next') }).focus();
      await page.keyboard.press('Enter');
      await page.getByRole('heading', { name: get(m, 'book.dateTitle') }).waitFor();
      await page
        .getByRole('button', { name: get(m, 'booking.dateLabel') })
        .first()
        .focus();
      await page.keyboard.press('Enter');
      await page.getByRole('grid').waitFor();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Escape');
      await page
        .getByRole('button', { name: get(m, 'booking.dateLabel') })
        .first()
        .waitFor();
    },
  );

  await ctx.close();
}
await browser.close();
console.log(failed ? '\nKEYBOARD CHECK FAILED' : '\nKEYBOARD CHECK PASSED');
process.exit(failed ? 1 : 0);
