// Checks the "no domain" setup (docs/DEPLOY.md): the web app relays the API under /backend, so the login cookies work
// even when the web app and the API are on DIFFERENT sites. Locally the two sites are 127.0.0.1 (web) and localhost (API).
// Start: API with COOKIE_PATH_PREFIX=/backend, APP_URL=http://127.0.0.1:3100, API_URL=http://localhost:4010;
//        web built with PUBLIC_API_URL=http://127.0.0.1:3100/backend, API_PROXY_TARGET=http://localhost:4010.
// Usage: node scripts/proxy-e2e.mjs [webUrl] [apiUrl]      (needs the demo seed: pnpm --filter api db:seed)
import { chromium } from 'playwright';

const web = process.argv[2] ?? 'http://127.0.0.1:3100';
const api = process.argv[3] ?? 'http://localhost:4010';
const browser = await chromium.launch({ channel: 'chrome' });
let failed = false;
const check = (name, ok, extra = '') => {
  console.log(ok ? 'OK  ' : 'FAIL', name, extra);
  if (!ok) failed = true;
};

const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(`${web}/fr/login`);

/** Runs a fetch in the page (like the web app does) and returns the HTTP status. */
const call = (url, method = 'GET', body) =>
  page.evaluate(
    async ([u, m, b]) => {
      const r = await fetch(u, {
        method: m,
        credentials: 'include',
        headers: b ? { 'content-type': 'application/json' } : undefined,
        body: b ? JSON.stringify(b) : undefined,
      });
      return r.status;
    },
    [url, method, body],
  );

const stamp = Date.now().toString(36);
const newUser = (tag) => ({
  name: 'Proxy Test',
  email: `proxy.${tag}.${stamp}@test.mawid`,
  password: 'Password123',
  terms: true,
});

// 1. Direct call to the API from another site: the browser drops the login cookies (the problem we had).
check(
  'direct API, other site: register works',
  (await call(`${api}/auth/register`, 'POST', newUser('direct'))) === 201,
);
check('direct API, other site: the session is lost (401)', (await call(`${api}/auth/me`)) === 401);

// 2. Through the relay: one site, the cookies stay.
await ctx.clearCookies();
check(
  'relay: register works',
  (await call('/backend/auth/register', 'POST', newUser('relay'))) === 201,
);
check('relay: the session holds (200)', (await call('/backend/auth/me')) === 200);
check(
  'relay: the refresh cookie reaches /backend/auth/refresh (200)',
  (await call('/backend/auth/refresh', 'POST')) === 200,
);
check('relay: still logged in after the refresh', (await call('/backend/auth/me')) === 200);
check('relay: logout (204)', (await call('/backend/auth/logout', 'POST')) === 204);
check('relay: logged out afterwards (401)', (await call('/backend/auth/me')) === 401);
const cookies = await ctx.cookies();
check(
  'no cookie is left after logout',
  !cookies.some((c) => c.name.startsWith('mawid_')),
  JSON.stringify(cookies.map((c) => c.name)),
);

// 3. The real screens: log in with the form, open the dashboard, reload, still logged in.
await page.goto(`${web}/fr/login`);
await page.getByLabel('Email').fill('owner.salon@mawid.demo');
await page.getByLabel('Mot de passe').fill('Demo1234!');
const calls = [];
page.on(
  'request',
  (r) =>
    r.url().includes('/auth/') && calls.push(new URL(r.url()).origin + new URL(r.url()).pathname),
);
await page.getByRole('button', { name: 'Se connecter' }).click();
await page.waitForURL(/\/fr\/dashboard/, { timeout: 15000 });
await page.reload();
await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 15000 });
check('UI: the dashboard stays open after a reload', page.url().includes('/dashboard'));
check(
  'UI: the browser only talked to the web site, under /backend',
  calls.length > 0 && calls.every((c) => c.startsWith(web + '/backend/')),
  JSON.stringify(calls.slice(0, 3)),
);

await browser.close();
console.log(failed ? '\nPROXY CHECK FAILED' : '\nPROXY CHECK PASSED');
process.exit(failed ? 1 : 0);
