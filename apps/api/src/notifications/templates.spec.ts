import { EmailContext, EmailType, renderEmail } from './templates';

const ctx: EmailContext = {
  businessName: 'Salon Nour',
  customerName: 'Fatima',
  serviceName: 'Coupe',
  staffName: 'Sidi Mohamed',
  startsAt: new Date('2026-12-01T10:00:00Z'),
  timezone: 'Africa/Nouakchott',
  price: 300,
  address: 'Tevragh Zeina',
  cancelUrl: 'https://app.test/fr/booking/tok',
  icsUrl: 'https://api.test/public/bookings/tok/calendar.ics',
  googleUrl: 'https://calendar.google.com/x',
  dashboardUrl: 'https://app.test/fr/dashboard/calendar',
};
const TYPES: EmailType[] = [
  'confirmation',
  'pending',
  'cancelled',
  'changed',
  'reminder',
  'owner_new_booking',
  'owner_cancelled',
  'owner_changed',
];

describe('renderEmail', () => {
  it.each(['ar', 'fr', 'en'])(
    'renders every type in %s with a subject, text and html',
    (locale) => {
      for (const type of TYPES) {
        const m = renderEmail(type, locale, ctx);
        expect([type, m.subject.length > 5, m.text.length > 20, m.html?.includes('<html')]).toEqual(
          [type, true, true, true],
        );
        expect(m.html).toContain('Coupe');
      }
    },
  );

  it('Arabic is right-to-left, French and English are left-to-right', () => {
    const ar = renderEmail('confirmation', 'ar', ctx).html!;
    expect(ar).toContain('<html lang="ar" dir="rtl">');
    expect(ar).toContain('direction:rtl');
    expect(ar).toContain('text-align:right');
    expect(renderEmail('confirmation', 'fr', ctx).html).toContain('<html lang="fr" dir="ltr">');
    expect(renderEmail('confirmation', 'en', ctx).html).toContain('dir="ltr"');
  });

  it('is written in the right language', () => {
    expect(renderEmail('confirmation', 'fr', ctx).subject).toMatch(/Réservation confirmée/);
    expect(renderEmail('confirmation', 'en', ctx).subject).toMatch(/Booking confirmed/);
    expect(renderEmail('confirmation', 'ar', ctx).subject).toMatch(/تم تأكيد الحجز/);
    expect(renderEmail('reminder', 'fr', ctx).subject).toMatch(/Rappel/);
  });

  it('falls back to French for an unknown language', () => {
    expect(renderEmail('confirmation', 'de', ctx).subject).toMatch(/Réservation confirmée/);
  });

  it('shows the time in the business time zone, not in UTC', () => {
    const dubai = renderEmail('confirmation', 'en', { ...ctx, timezone: 'Asia/Dubai' }).text;
    expect(dubai).toMatch(/2:00\s?PM/); // 10:00 UTC = 14:00 in Dubai
    const nouakchott = renderEmail('confirmation', 'en', ctx).text;
    expect(nouakchott).toMatch(/10:00\s?AM/);
  });

  it('uses Latin digits in Arabic', () => {
    const m = renderEmail('confirmation', 'ar', ctx);
    expect(m.text).toMatch(/2026/);
    expect(m.text).not.toMatch(/[٠-٩]/);
  });

  it('escapes HTML in customer-controlled values', () => {
    const evil = renderEmail('owner_new_booking', 'fr', {
      ...ctx,
      customerName: '<script>alert(1)</script>',
      serviceName: '"><img src=x>',
    });
    expect(evil.html).not.toContain('<script>');
    expect(evil.html).not.toContain('<img');
    expect(evil.html).toContain('&lt;script&gt;');
  });

  it('puts the cancel, calendar and Google links in customer emails', () => {
    const m = renderEmail('confirmation', 'fr', ctx);
    expect(m.text).toContain(ctx.cancelUrl);
    expect(m.text).toContain(ctx.icsUrl);
    expect(m.text).toContain(ctx.googleUrl);
    expect(m.html).toContain(`href="${ctx.cancelUrl}"`);
  });

  it('offers no links in a cancellation, and only the cancel link while pending', () => {
    expect(renderEmail('cancelled', 'fr', ctx).text).not.toContain('https://');
    const pending = renderEmail('pending', 'fr', ctx).text;
    expect(pending).toContain(ctx.cancelUrl);
    expect(pending).not.toContain(ctx.icsUrl);
  });

  it('owner emails link to the calendar and show the customer', () => {
    const m = renderEmail('owner_new_booking', 'fr', ctx);
    expect(m.text).toContain(ctx.dashboardUrl);
    expect(m.text).toContain('Fatima');
    expect(m.text).not.toContain(ctx.cancelUrl);
  });
});
