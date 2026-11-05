// Accessibility check with axe-core on every page, in Arabic and French (light theme), plus the dark theme for
// the main pages, plus some open dialogs. Fails on any "serious" or "critical" problem (WCAG 2.1 A and AA).
// It builds its own data (owner, bookings, review link, admin account) and removes it at the end.
// Needs the API (default http://localhost:4010) and the web app (default http://localhost:3100) running.
// Usage: node scripts/a11y.mjs [webUrl] [apiUrl]
import AxeBuilder from '@axe-core/playwright';
import { chromium, request as pwRequest } from 'playwright';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3100';
const api = process.argv[3] ?? 'http://localhost:4010';
const msg = (l) =>
  JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), 'utf8'));
const get = (m, path) => path.split('.').reduce((o, k) => o[k], m);

const apiRequire = createRequire(new URL('../../api/package.json', import.meta.url));
apiRequire('dotenv/config');
const { PrismaClient } = apiRequire('@prisma/client');
const argon2 = apiRequire('argon2');
const prisma = new PrismaClient();
const PASSWORD = 'Password123';
const stamp = Date.now().toString(36);
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------------------------
const rq = await pwRequest.newContext({ baseURL: api });
const ownerEmail = `a11y.owner.${stamp}@test.mawid`;
const reg = await rq.post('/auth/register', {
  data: { name: 'Owner A11y', email: ownerEmail, password: PASSWORD, terms: true, locale: 'fr' },
});
const businessId = (await reg.json()).businessId;
const slug = `a11y-${stamp}`;
const must = async (p) => {
  const r = await p;
  if (!r.ok()) throw new Error(`${r.url()} -> ${r.status()} ${await r.text()}`);
  return r.json();
};
await must(
  rq.patch('/businesses/me', {
    data: {
      slug,
      name: 'Salon Accessible',
      timezone: 'UTC',
      defaultLocale: 'fr',
      category: 'salon',
      address: 'Tevragh Zeina, Nouakchott',
      phone: '+222 22 00 11 22',
      description: 'Un salon pour tous.',
      paymentInstructions: 'Bankily 22 00 11 22',
    },
  }),
);
await prisma.business.update({ where: { id: businessId }, data: { plan: 'PRO' } });
const dep = await must(
  rq.post('/services', {
    data: { name: 'Coupe', durationMin: 30, price: 300, depositAmount: 100 },
  }),
);
const plain = await must(
  rq.post('/services', { data: { name: 'Barbe', durationMin: 30, price: 500 } }),
);
const staff = await must(
  rq.post('/staff', { data: { displayName: 'Sidi Ahmed', serviceIds: [dep.id, plain.id] } }),
);
await must(
  rq.put(`/staff/${staff.id}/working-hours`, {
    data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      startTime: '09:00',
      endTime: '18:00',
    })),
  }),
);
const pub = (serviceId, time) =>
  must(
    rq.post('/public/bookings', {
      data: {
        businessSlug: slug,
        serviceId,
        staffId: staff.id,
        startsAt: `${day(6)}T${time}:00.000Z`,
        customer: {
          name: `Client ${time}`,
          phone: `+2226${Math.floor(1000000 + Math.random() * 8999999)}`,
        },
        locale: 'fr',
      },
    }),
  );
const depositBooking = await pub(dep.id, '10:00');
await rq.post(`/public/bookings/${depositBooking.cancelToken}/payment`, {
  data: { reference: 'BK-4455' },
});
const plainBooking = await pub(plain.id, '11:00');
const customer = await prisma.customer.create({
  data: { businessId, name: 'Aïcha Mint Sidi', phone: '+22255123456' },
});
const past = await prisma.booking.create({
  data: {
    businessId,
    customerId: customer.id,
    staffId: staff.id,
    serviceId: dep.id,
    startsAt: new Date(`${day(-1)}T15:00:00.000Z`),
    endsAt: new Date(`${day(-1)}T15:30:00.000Z`),
    status: 'COMPLETED',
    price: 300,
  },
});
const rev = await prisma.review.create({
  data: { businessId, bookingId: past.id, rating: 5, comment: 'Excellent !', reply: 'Merci !' },
});
void rev;
const toReview = await prisma.booking.create({
  data: {
    businessId,
    customerId: customer.id,
    staffId: staff.id,
    serviceId: plain.id,
    startsAt: new Date(`${day(-1)}T16:00:00.000Z`),
    endsAt: new Date(`${day(-1)}T16:30:00.000Z`),
    status: 'COMPLETED',
    price: 500,
  },
});
const adminEmail = `a11y.admin.${stamp}@test.mawid`;
await prisma.user.create({
  data: {
    email: adminEmail,
    name: 'Admin',
    role: 'ADMIN',
    locale: 'fr',
    passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
  },
});

// ---------------------------------------------------------------------------------------------
const browser = await chromium.launch({ channel: 'chrome' });
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
let bad = 0;
let checked = 0;
const minor = new Map();

async function login(ctx, email) {
  const r = await ctx.request.post(`${api}/auth/login`, { data: { email, password: PASSWORD } });
  if (!r.ok()) throw new Error('login failed');
}

async function scan(page, name) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(400); // charts and animations settle
  const res = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  checked++;
  const serious = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  for (const v of res.violations.filter((x) => !serious.includes(x)))
    minor.set(v.id, (minor.get(v.id) ?? 0) + 1);
  if (serious.length === 0) {
    console.log('OK  ', name);
    return;
  }
  bad += serious.length;
  console.log('FAIL', name);
  for (const v of serious) {
    console.log(`     [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} element(s))`);
    for (const n of v.nodes.slice(0, 3))
      console.log(
        `       ${n.target.join(' ')}  ${(n.failureSummary ?? '').split('\n')[1] ?? ''}`.slice(
          0,
          230,
        ),
      );
  }
}

async function run(locale, theme, pages) {
  const m = msg(locale);
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale,
    colorScheme: theme,
  });
  await ctx.addInitScript((t) => localStorage.setItem('theme', t), theme);
  const page = await ctx.newPage();
  for (const [label, path, setup, auth] of pages(m, locale)) {
    if (auth) {
      await ctx.clearCookies();
      await login(ctx, auth === 'admin' ? adminEmail : ownerEmail);
    } else if (auth === null) await ctx.clearCookies();
    await page.goto(`${base}/${locale}${path}`);
    if (setup) await setup(page, m);
    await scan(page, `${locale}/${theme} ${label}`);
  }
  await ctx.close();
}

const pagesPublic = (m) => [
  ['home', '', undefined, null],
  ['login', '/login'],
  ['register', '/register'],
  ['forgot-password', '/forgot-password'],
  ['business page', `/b/${slug}`],
  ['booking flow', `/b/${slug}/book`],
  [
    'chat widget open',
    `/b/${slug}`,
    async (p) => {
      await p.getByRole('button', { name: get(m, 'b.chatOpen') }).click();
      await p.getByRole('dialog').waitFor();
    },
  ],
  ['manage booking + deposit', `/booking/${depositBooking.cancelToken}`],
  ['manage booking (no deposit)', `/booking/${plainBooking.cancelToken}`],
  ['review page', `/review/${toReview.reviewToken}`],
  ['404', '/does-not-exist'],
  ['design system', '/design'],
];
const pagesOwner = (m) => [
  ['dashboard', '/dashboard', undefined, 'owner'],
  ['calendar', '/dashboard/calendar'],
  ['customers', '/dashboard/customers'],
  ['payments', '/dashboard/payments'],
  ['reviews', '/dashboard/reviews'],
  ['services', '/dashboard/services'],
  [
    'service dialog',
    '/dashboard/services',
    async (p) => {
      await p
        .getByRole('button', { name: get(m, 'services.add') })
        .first()
        .click();
      await p.getByRole('dialog').waitFor();
    },
  ],
  ['staff', '/dashboard/staff'],
  ['settings', '/dashboard/settings'],
  ['onboarding', '/onboarding'],
];
const pagesAdmin = () => [['admin', '/admin', undefined, 'admin']];

try {
  for (const locale of ['ar', 'fr', 'en']) {
    await run(locale, 'light', pagesPublic);
    await run(locale, 'light', pagesOwner);
    await run(locale, 'light', pagesAdmin);
  }
  // Dark theme: contrast problems often hide here.
  for (const locale of ['ar', 'fr']) {
    await run(locale, 'dark', (m, l) => [
      ...pagesPublic(m, l).slice(0, 6),
      ...pagesOwner(m, l).slice(0, 3),
      ...pagesAdmin(),
    ]);
  }
} finally {
  await prisma.user.deleteMany({ where: { email: { contains: `.${stamp}@test.mawid` } } });
  await prisma.business.deleteMany({ where: { slug } });
  await prisma.$disconnect();
  await browser.close();
}

console.log(`\n${checked} pages checked, ${bad} serious or critical problem(s).`);
if (minor.size)
  console.log(
    'Other (moderate or minor) findings: ' + [...minor].map(([id, n]) => `${id} x${n}`).join(', '),
  );
process.exit(bad ? 1 : 0);
