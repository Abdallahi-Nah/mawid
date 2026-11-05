// AC-10 helper: sends the real emails (confirmation, reminder, review request) to an address you own, through the
// configured provider (Resend), to check delivery, the sender domain, spam folder and the Arabic (RTL) layout.
// Usage: pnpm --filter api build && pnpm --filter api mail:check you@example.com
// Needs RESEND_API_KEY and MAIL_FROM (a verified domain) in apps/api/.env. Not used by the application.
import 'dotenv/config';
import { loadEnv } from '../config/env';
import { ResendMailService } from '../mail/resend-mail.service';
import { renderEmail, type EmailType } from '../notifications/templates';

async function main(): Promise<void> {
  const to = process.argv[2];
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    console.error('Usage: pnpm --filter api mail:check you@example.com');
    process.exit(1);
  }
  const env = loadEnv();
  if (!env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is empty: set it in apps/api/.env to send real emails.');
    process.exit(1);
  }
  const mail = new ResendMailService(env.RESEND_API_KEY, env.MAIL_FROM);
  const startsAt = new Date(Date.now() + 24 * 3_600_000);
  const ctx = {
    businessName: 'Salon Nour',
    customerName: 'Fatima',
    serviceName: 'Coupe',
    staffName: 'Ahmed',
    startsAt,
    timezone: 'Africa/Nouakchott',
    price: 300,
    address: 'Tevragh Zeina, Nouakchott',
    cancelUrl: `${env.APP_URL}/fr/booking/test-token`,
    reviewUrl: `${env.APP_URL}/fr/review/test-token`,
  };
  const plan: [EmailType, string][] = [
    ['confirmation', 'fr'],
    ['reminder', 'ar'],
    ['review_request', 'en'],
  ];
  for (const [type, locale] of plan) {
    await mail.send({ to, ...renderEmail(type, locale, ctx) });
    console.log(`sent: ${type} (${locale}) -> ${to}`);
  }
  console.log('Check your inbox AND your spam folder, then note the time it took to arrive.');
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
