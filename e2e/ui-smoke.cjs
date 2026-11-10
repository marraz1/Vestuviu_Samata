// Browser smoke test at phone width (360px) against the live Neon services.
// Run: npm run build && npx vite preview --port 4173 &  then  npm run test:ui [screenshot-dir] [base-url]
// Creates a throwaway vs-ui-*@example.com account; its wedding is deleted at the end.
const { chromium } = require('playwright');
const out = process.argv[2] || require('os').tmpdir();
const BASE = process.argv[3] || 'http://localhost:4173/Vestuviu_Samata/';
(async () => {
  const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost' } : undefined });
  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const shot = (n) => page.screenshot({ path: `${out}/${n}.png`, fullPage: true });
  const step = (s) => console.log('STEP', s);

  await page.goto(BASE);
  await page.getByRole('heading', { name: 'Prisijungimas' }).waitFor();
  await shot('01-login');
  step('register');
  await page.getByRole('button', { name: 'Registruotis' }).click();
  await page.getByLabel('Vardas').fill('Testas');
  await page.getByLabel('El. paštas').fill(`vs-ui-${Date.now()}@example.com`);
  await page.getByLabel('Slaptažodis').fill('Ui-test-pass-1');
  await page.getByRole('button', { name: 'Sukurti paskyrą' }).click();

  step('onboarding');
  await page.getByRole('heading', { name: /Sveiki/ }).waitFor({ timeout: 20000 });
  await page.getByLabel('Vestuvių data').fill('2027-01-20');
  await page.getByLabel('Preliminarus svečių skaičius').fill('100');
  await page.getByLabel('Bendras biudžetas').fill('20000');
  await shot('02-onboarding');
  await page.getByRole('button', { name: 'Sukurti' }).click();

  step('dashboard');
  await page.getByText('Biudžeto panaudojimas').waitFor({ timeout: 20000 });
  await shot('03-dashboard-empty');

  step('quick add');
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Pridėti išlaidą' }).click();
  await page.getByLabel('Pavadinimas').fill('Fotografas');
  await page.getByLabel('Kategorija').selectOption({ label: 'Fotografas' });
  await page.getByLabel('Planuojama suma').fill('1 500');
  await shot('04-quick-add');
  await page.getByRole('button', { name: 'Išsaugoti' }).click();
  await page.getByText('Pridėta: Fotografas').waitFor();
  console.log('quick add ms', Date.now() - t0);

  step('per-guest expense via detail');
  await page.getByRole('button', { name: 'Pridėti išlaidą' }).click();
  await page.getByLabel('Pavadinimas').fill('Vakarienė');
  await page.getByLabel('Kategorija').selectOption({ label: 'Maistas ir gėrimai' });
  await page.getByRole('button', { name: 'Daugiau…' }).click();
  await page.getByRole('heading', { name: 'Vakarienė' }).waitFor();
  await page.getByLabel('Skaičiavimas').selectOption('per_guest');
  await page.getByLabel('Kaina svečiui').fill('60');
  await page.getByRole('button', { name: 'Išsaugoti', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Išsaugota' }).first().waitFor();
  const forecast = await page.locator('text=Prognozė').locator('..').innerText();
  console.log('forecast block:', forecast.replace(/\s+/g, ' '));

  step('add payment');
  await page.getByRole('button', { name: '+ Mokėjimas' }).click();
  await page.getByLabel('Suma', { exact: true }).fill('1000');
  const soon = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  await page.getByLabel('Mokėjimo terminas').fill(soon);
  await page.getByRole('button', { name: 'Pridėti' }).click();
  await page.getByText('Iki ').first().waitFor();
  await shot('05-expense-detail');

  step('guest count change');
  await page.getByRole('link', { name: 'Nustatymai' }).click();
  await page.getByLabel('Svečių skaičius').fill('150');
  await page.getByRole('button', { name: 'Išsaugoti' }).click();
  await page.getByText('Nustatymai išsaugoti').waitFor();
  await shot('06-settings');

  step('dashboard after');
  await page.getByRole('link', { name: 'Pradžia' }).click();
  await page.getByText('Įspėjimai').waitFor();
  const kpis = await page.locator('main').innerText();
  console.log('dashboard:', kpis.replace(/\s+/g, ' ').slice(0, 600));
  await shot('07-dashboard');

  step('categories + calendar + list');
  await page.getByRole('link', { name: 'Kategorijos' }).click();
  await page.getByRole('button', { name: /Fotografas/ }).click();
  await page.getByText('Suma', { exact: true }).click();
  await page.getByLabel('Limito suma').fill('1600');
  await page.getByRole('button', { name: 'Išsaugoti' }).click();
  await page.waitForTimeout(1500);
  await shot('08-categories');
  await page.getByRole('link', { name: 'Mokėjimai' }).click();
  await page.waitForTimeout(1000);
  await shot('09-calendar');
  await page.getByRole('link', { name: 'Išlaidos' }).click();
  await page.waitForTimeout(1000);
  await shot('10-expenses');

  step('delete + undo');
  await page.getByRole('link', { name: /Fotografas/ }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Ištrinti' }).click();
  await page.getByRole('button', { name: 'Atšaukti' }).click();
  await page.waitForTimeout(1500);
  console.log('after undo has Fotografas:', await page.getByRole('link', { name: /Fotografas/ }).count());

  step('reload keeps session');
  await page.reload();
  await page.getByRole('heading', { name: 'Išlaidos' }).waitFor({ timeout: 15000 });

  step('cleanup');
  await page.getByRole('link', { name: 'Nustatymai' }).click();
  page.once('dialog', (d) => d.accept('TRINTI'));
  await page.getByRole('button', { name: 'Ištrinti', exact: true }).click();
  await page.getByRole('heading', { name: 'Prisijungimas' }).waitFor({ timeout: 15000 });

  console.log('ERRORS', JSON.stringify(errors));
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  console.log('scrollWidth', sw);
  await browser.close();
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
