// End-to-end check of the real flow (register, onboarding, dashboard pages, public page, logout) in French.
// Needs the API and the web app running. Usage: node scripts/flow-check.mjs [webUrl]
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://localhost:3100';
const out = '/tmp/mawid-flow-shots/';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync(out, { recursive: true });
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
writeFileSync('/tmp/mawid-flow-shots/p.png', png);
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
const p = await ctx.newPage();
const errors = [];
p.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160)));
p.on('pageerror', (e) => errors.push('PAGEERR ' + String(e).slice(0, 160)));
const step = async (name, fn) => {
  try {
    await fn();
    console.log('OK  ', name);
  } catch (e) {
    console.log('FAIL', name, '-', String(e).split('\n')[0].slice(0, 200));
    await p.screenshot({
      path: out + 'fail-' + name.replace(/\W+/g, '_') + '.png',
      fullPage: true,
    });
    throw e;
  }
};
const email = `e2e.${Date.now()}@test.mawid`;
const slugName = `Salon Flow ${Date.now().toString(36)}`;
try {
  await step('protected page redirects to login', async () => {
    await p.goto(base + '/fr/dashboard/services');
    await p.waitForURL('**/fr/login', { timeout: 8000 });
  });
  await step('register wrong input shows errors', async () => {
    await p.goto(base + '/fr/register');
    await p.getByRole('button', { name: "S'inscrire" }).click();
    await p.getByText('Ce champ est obligatoire').first().waitFor();
  });
  await step('register', async () => {
    await p.getByLabel('Nom', { exact: true }).fill('Aïcha Test');
    await p.getByLabel('Email').fill(email);
    await p.getByLabel('Mot de passe').fill('Password123');
    await p.getByLabel("J'accepte les conditions").click();
    await p.getByRole('button', { name: "S'inscrire" }).click();
    await p.waitForURL('**/fr/onboarding', { timeout: 10000 });
  });
  await step('duplicate email message', async () => {
    const p2 = await ctx.newPage();
    await p2.goto(base + '/fr/register');
    await p2.getByLabel('Nom', { exact: true }).fill('Dup');
    await p2.getByLabel('Email').fill(email);
    await p2.getByLabel('Mot de passe').fill('Password123');
    await p2.getByLabel("J'accepte les conditions").click();
    await p2.getByRole('button', { name: "S'inscrire" }).click();
    await p2.getByText('Cet email est déjà utilisé').waitFor();
    await p2.close();
  });
  await step('onboarding', async () => {
    await p.getByLabel("Nom de l'activité").fill(slugName);
    await p.getByRole('combobox').click();
    await p.getByRole('option', { name: 'Salon' }).click();
    await p.getByLabel('Téléphone').fill('+222 22 00 11 22');
    await p.getByRole('button', { name: 'Suivant' }).click();
    await p.getByLabel('Taille de barbe').click();
    await p.getByRole('button', { name: 'Suivant' }).click();
    await p.getByRole('button', { name: 'Suivant' }).click();
    await p.getByLabel("Nom de l'employé").fill('Mariem Test');
    await p.getByRole('button', { name: "Ajouter l'employé" }).click();
    await p.getByRole('button', { name: 'Terminer' }).click();
    await p.getByText("C'est prêt !").waitFor({ timeout: 15000 });
  });
  await step('services page lists onboarding services; add one', async () => {
    await p.goto(base + '/fr/dashboard/services');
    await p.getByText('Coupe de cheveux').waitFor();
    await p.getByText('Taille de barbe').waitFor();
    await p.getByRole('button', { name: 'Ajouter un service' }).click();
    await p.getByLabel('Nom', { exact: true }).fill('Massage');
    await p.getByLabel('Prix (MRU)').fill('900');
    await p.getByRole('button', { name: 'Enregistrer' }).click();
    await p.getByText('Massage').waitFor();
  });
  await step('service validation error', async () => {
    await p.getByRole('button', { name: 'Ajouter un service' }).click();
    await p.getByRole('button', { name: 'Enregistrer' }).click();
    await p.getByText('Ce champ est obligatoire').first().waitFor();
    await p.keyboard.press('Escape');
  });
  await step('staff page: edit hours, photo; add time off', async () => {
    await p.goto(base + '/fr/dashboard/staff');
    await p.getByText('Mariem Test').waitFor();
    await p.getByRole('button', { name: 'Modifier Mariem Test' }).click();
    await p.getByLabel('Pause').first().click();
    await p.locator('input[type=file]').setInputFiles('/tmp/mawid-flow-shots/p.png');
    await p.getByText('Enregistré').first().waitFor();
    await p.getByRole('button', { name: 'Enregistrer' }).click();
    await p.waitForTimeout(800);
    await p.getByRole('button', { name: 'Ajouter un congé' }).click();
    await p.getByLabel('Du', { exact: true }).fill('2026-12-25');
    await p.getByLabel('Au (inclus)').fill('2026-12-26');
    await p.getByLabel('Motif (facultatif)').fill('Fête');
    await p.getByRole('button', { name: 'Enregistrer' }).click();
    await p.getByText('Fête').waitFor();
  });
  await step('settings: save, bad slug error', async () => {
    await p.goto(base + '/fr/dashboard/settings');
    await p.getByLabel('Description').fill('Un super salon de test.');
    await p.getByLabel('Adresse de la page').fill('Bad Slug!');
    await p.getByRole('button', { name: 'Enregistrer' }).click();
    await p.getByText('3 à 40 caractères').waitFor();
    await p.getByLabel('Adresse de la page').fill(slugName.toLowerCase().replace(/\s+/g, '-'));
    await p.getByRole('button', { name: 'Enregistrer' }).click();
    await p.getByText('Enregistré').first().waitFor();
  });
  const slug = slugName.toLowerCase().replace(/\s+/g, '-');
  await step('public page shows real data', async () => {
    await p.goto(`${base}/fr/b/${slug}`);
    await p.getByRole('heading', { name: slugName }).waitFor();
    await p.getByText('Un super salon de test.').waitFor();
    await p.getByText('Massage').waitFor();
    await p.getByText('Mariem Test').waitFor();
    await p.screenshot({ path: out + 'public.png', fullPage: true });
  });
  await step('booking page uses real services', async () => {
    await p.goto(`${base}/fr/b/${slug}/book`);
    await p.getByText('Massage').waitFor();
    await p.getByText('Taille de barbe').waitFor();
  });
  await step('unknown business is a 404', async () => {
    const r = await p.goto(`${base}/fr/b/nope-nope-nope`);
    if (r.status() !== 404) throw new Error('status ' + r.status());
  });
  await step('logout then dashboard needs login', async () => {
    await p.goto(base + '/fr/dashboard');
    await p.getByRole('button', { name: 'Se déconnecter' }).click();
    await p.waitForURL('**/fr/login');
    await p.goto(base + '/fr/dashboard');
    await p.waitForURL('**/fr/login');
  });
  await step('login with wrong password', async () => {
    await p.getByLabel('Email').fill(email);
    await p.getByLabel('Mot de passe').fill('Wrong-pass-1');
    await p.getByRole('button', { name: 'Se connecter' }).click();
    await p.getByText('Email ou mot de passe incorrect').waitFor();
  });
  await step('login ok -> dashboard, RTL page in arabic', async () => {
    await p.getByLabel('Mot de passe').fill('Password123');
    await p.getByRole('button', { name: 'Se connecter' }).click();
    await p.waitForURL('**/fr/dashboard');
    await p.goto(base + '/ar/dashboard/staff');
    await p.getByText('Mariem Test').waitFor();
    await p.screenshot({ path: out + 'staff-ar.png', fullPage: true });
    await p.goto(base + '/ar/dashboard/settings');
    await p.waitForSelector('#s-name');
    await p.screenshot({ path: out + 'settings-ar.png', fullPage: true });
  });
} catch {}
console.log('console errors:', errors.length ? errors : 'none');
await b.close();
