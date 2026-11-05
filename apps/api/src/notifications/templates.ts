import type { MailMessage } from '../mail/mail.service';

// Email templates in Arabic (RTL), French and English. Plain text and HTML.
// Every dynamic value is HTML-escaped. Dates are shown in the business time zone, with Latin digits.

export type EmailType =
  | 'confirmation'
  | 'pending'
  | 'cancelled'
  | 'changed'
  | 'reminder'
  | 'review_request'
  | 'owner_new_booking'
  | 'owner_cancelled'
  | 'owner_changed';
export type Locale = 'ar' | 'fr' | 'en';

export interface EmailContext {
  businessName: string;
  customerName: string;
  serviceName: string;
  staffName: string;
  startsAt: Date;
  timezone: string;
  price: number;
  address?: string | null;
  phone?: string | null;
  cancelUrl?: string; // customer: cancel or change page
  icsUrl?: string;
  googleUrl?: string;
  dashboardUrl?: string; // owner: calendar
  reviewUrl?: string; // review_request: the rating page
}

interface Copy {
  labels: {
    service: string;
    when: string;
    with: string;
    price: string;
    where: string;
    customer: string;
  };
  subject: Record<
    EmailType,
    (c: { service: string; business: string; when: string; customer: string }) => string
  >;
  heading: Record<EmailType, string>;
  intro: Record<EmailType, (c: { name: string; business: string }) => string>;
  cancelLink: string;
  rateLink: string;
  addToCalendar: string;
  google: string;
  openCalendar: string;
  footer: (business: string) => string;
}

const COPY: Record<Locale, Copy> = {
  fr: {
    labels: {
      service: 'Service',
      when: 'Date et heure',
      with: 'Avec',
      price: 'Prix',
      where: 'Adresse',
      customer: 'Client',
    },
    subject: {
      confirmation: (c) => `Réservation confirmée : ${c.service}, ${c.when}`,
      pending: (c) => `Demande de réservation reçue : ${c.service}`,
      cancelled: (c) => `Réservation annulée : ${c.service}, ${c.when}`,
      changed: (c) => `Réservation modifiée : ${c.service}, ${c.when}`,
      reminder: (c) => `Rappel : ${c.service} demain, ${c.when}`,
      review_request: (c) => `Comment s'est passée votre visite chez ${c.business} ?`,
      owner_new_booking: (c) => `Nouvelle réservation : ${c.customer}, ${c.when}`,
      owner_cancelled: (c) => `Réservation annulée par ${c.customer}, ${c.when}`,
      owner_changed: (c) => `Réservation déplacée par ${c.customer}, ${c.when}`,
    },
    heading: {
      confirmation: 'Votre réservation est confirmée',
      pending: 'Votre demande est bien reçue',
      cancelled: 'Votre réservation est annulée',
      changed: 'Votre réservation a changé',
      reminder: 'Rappel de votre rendez-vous',
      review_request: 'Donnez votre avis',
      owner_new_booking: 'Nouvelle réservation',
      owner_cancelled: 'Réservation annulée',
      owner_changed: 'Réservation déplacée',
    },
    intro: {
      confirmation: (c) => `Bonjour ${c.name}, votre rendez-vous chez ${c.business} est confirmé.`,
      pending: (c) =>
        `Bonjour ${c.name}, ${c.business} doit confirmer votre demande. Vous recevrez un email.`,
      cancelled: (c) => `Bonjour ${c.name}, votre rendez-vous chez ${c.business} est annulé.`,
      changed: (c) =>
        `Bonjour ${c.name}, votre rendez-vous chez ${c.business} a été déplacé. Voici le nouvel horaire.`,
      reminder: (c) => `Bonjour ${c.name}, nous vous attendons demain chez ${c.business}.`,
      review_request: (c) =>
        `Bonjour ${c.name}, merci de votre visite chez ${c.business}. Notez-la en 1 minute : votre avis aide les autres clients.`,
      owner_new_booking: () => 'Un client vient de réserver.',
      owner_cancelled: () => 'Un client a annulé son rendez-vous.',
      owner_changed: () => 'Un client a déplacé son rendez-vous.',
    },
    cancelLink: 'Annuler ou changer ce rendez-vous',
    rateLink: 'Donner mon avis',
    addToCalendar: 'Ajouter à mon agenda (.ics)',
    google: 'Ajouter à Google Agenda',
    openCalendar: 'Ouvrir le calendrier',
    footer: (b) => `Message envoyé par ${b} avec Mawid.`,
  },
  en: {
    labels: {
      service: 'Service',
      when: 'Date and time',
      with: 'With',
      price: 'Price',
      where: 'Address',
      customer: 'Customer',
    },
    subject: {
      confirmation: (c) => `Booking confirmed: ${c.service}, ${c.when}`,
      pending: (c) => `Booking request received: ${c.service}`,
      cancelled: (c) => `Booking cancelled: ${c.service}, ${c.when}`,
      changed: (c) => `Booking changed: ${c.service}, ${c.when}`,
      reminder: (c) => `Reminder: ${c.service} tomorrow, ${c.when}`,
      review_request: (c) => `How was your visit to ${c.business}?`,
      owner_new_booking: (c) => `New booking: ${c.customer}, ${c.when}`,
      owner_cancelled: (c) => `Booking cancelled by ${c.customer}, ${c.when}`,
      owner_changed: (c) => `Booking moved by ${c.customer}, ${c.when}`,
    },
    heading: {
      confirmation: 'Your booking is confirmed',
      pending: 'We received your request',
      cancelled: 'Your booking is cancelled',
      changed: 'Your booking has changed',
      reminder: 'Reminder of your appointment',
      review_request: 'Share your opinion',
      owner_new_booking: 'New booking',
      owner_cancelled: 'Booking cancelled',
      owner_changed: 'Booking moved',
    },
    intro: {
      confirmation: (c) => `Hello ${c.name}, your appointment at ${c.business} is confirmed.`,
      pending: (c) =>
        `Hello ${c.name}, ${c.business} must confirm your request. You will get an email.`,
      cancelled: (c) => `Hello ${c.name}, your appointment at ${c.business} is cancelled.`,
      changed: (c) =>
        `Hello ${c.name}, your appointment at ${c.business} was moved. Here is the new time.`,
      reminder: (c) => `Hello ${c.name}, we expect you tomorrow at ${c.business}.`,
      review_request: (c) =>
        `Hello ${c.name}, thank you for visiting ${c.business}. Rate your visit in 1 minute: it helps other customers.`,
      owner_new_booking: () => 'A customer just booked.',
      owner_cancelled: () => 'A customer cancelled their appointment.',
      owner_changed: () => 'A customer moved their appointment.',
    },
    cancelLink: 'Cancel or change this appointment',
    rateLink: 'Rate my visit',
    addToCalendar: 'Add to my calendar (.ics)',
    google: 'Add to Google Calendar',
    openCalendar: 'Open the calendar',
    footer: (b) => `Message sent by ${b} with Mawid.`,
  },
  ar: {
    labels: {
      service: 'الخدمة',
      when: 'التاريخ والوقت',
      with: 'مع',
      price: 'السعر',
      where: 'العنوان',
      customer: 'العميل',
    },
    subject: {
      confirmation: (c) => `تم تأكيد الحجز: ${c.service}، ${c.when}`,
      pending: (c) => `تم استلام طلب الحجز: ${c.service}`,
      cancelled: (c) => `تم إلغاء الحجز: ${c.service}، ${c.when}`,
      changed: (c) => `تم تعديل الحجز: ${c.service}، ${c.when}`,
      reminder: (c) => `تذكير: ${c.service} غدًا، ${c.when}`,
      review_request: (c) => `كيف كانت زيارتك إلى ${c.business}؟`,
      owner_new_booking: (c) => `حجز جديد: ${c.customer}، ${c.when}`,
      owner_cancelled: (c) => `ألغى ${c.customer} حجزه، ${c.when}`,
      owner_changed: (c) => `غيّر ${c.customer} موعد حجزه، ${c.when}`,
    },
    heading: {
      confirmation: 'تم تأكيد حجزك',
      pending: 'استلمنا طلبك',
      cancelled: 'تم إلغاء حجزك',
      changed: 'تم تعديل حجزك',
      reminder: 'تذكير بموعدك',
      review_request: 'شاركنا رأيك',
      owner_new_booking: 'حجز جديد',
      owner_cancelled: 'حجز ملغى',
      owner_changed: 'حجز تم نقله',
    },
    intro: {
      confirmation: (c) => `مرحبًا ${c.name}، تم تأكيد موعدك لدى ${c.business}.`,
      pending: (c) =>
        `مرحبًا ${c.name}، يجب على ${c.business} تأكيد طلبك. ستصلك رسالة بريد إلكتروني.`,
      cancelled: (c) => `مرحبًا ${c.name}، تم إلغاء موعدك لدى ${c.business}.`,
      changed: (c) => `مرحبًا ${c.name}، تم نقل موعدك لدى ${c.business}. هذا هو الوقت الجديد.`,
      reminder: (c) => `مرحبًا ${c.name}، ننتظرك غدًا لدى ${c.business}.`,
      review_request: (c) =>
        `مرحبًا ${c.name}، شكرًا لزيارتك ${c.business}. قيّم زيارتك في دقيقة واحدة: رأيك يساعد العملاء الآخرين.`,
      owner_new_booking: () => 'حجز عميل جديد للتو.',
      owner_cancelled: () => 'ألغى عميل موعده.',
      owner_changed: () => 'نقل عميل موعده.',
    },
    cancelLink: 'إلغاء هذا الموعد أو تغييره',
    rateLink: 'قيّم زيارتي',
    addToCalendar: 'إضافة إلى تقويمي (.ics)',
    google: 'إضافة إلى تقويم Google',
    openCalendar: 'فتح التقويم',
    footer: (b) => `رسالة من ${b} عبر موعد.`,
  },
};

export const asLocale = (l: string): Locale => (l === 'ar' || l === 'fr' || l === 'en' ? l : 'fr');

const esc = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function formatWhen(d: Date, timezone: string, locale: Locale): string {
  const intl = locale === 'ar' ? 'ar-u-nu-latn' : locale;
  return new Intl.DateTimeFormat(intl, {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(d);
}

const OWNER_TYPES: EmailType[] = ['owner_new_booking', 'owner_cancelled', 'owner_changed'];

/** Builds the email (subject, text and HTML) of a notification in the given language. */
export function renderEmail(
  type: EmailType,
  localeRaw: string,
  ctx: EmailContext,
): Omit<MailMessage, 'to'> {
  const locale = asLocale(localeRaw);
  const c = COPY[locale];
  const rtl = locale === 'ar';
  const when = formatWhen(ctx.startsAt, ctx.timezone, locale);
  const owner = OWNER_TYPES.includes(type);

  const rows: [string, string][] = [
    ...(owner ? ([[c.labels.customer, ctx.customerName]] as [string, string][]) : []),
    [c.labels.service, ctx.serviceName],
    [c.labels.when, when],
    [c.labels.with, ctx.staffName],
    [c.labels.price, `${ctx.price} MRU`],
    ...(!owner && ctx.address ? ([[c.labels.where, ctx.address]] as [string, string][]) : []),
  ];
  const links: [string, string][] = [];
  if (type === 'review_request') {
    if (ctx.reviewUrl) links.push([c.rateLink, ctx.reviewUrl]);
  } else if (!owner && type !== 'cancelled') {
    if (ctx.cancelUrl) links.push([c.cancelLink, ctx.cancelUrl]);
    if (ctx.icsUrl && type !== 'pending') links.push([c.addToCalendar, ctx.icsUrl]);
    if (ctx.googleUrl && type !== 'pending') links.push([c.google, ctx.googleUrl]);
  }
  if (owner && ctx.dashboardUrl) links.push([c.openCalendar, ctx.dashboardUrl]);

  const intro = c.intro[type]({ name: ctx.customerName, business: ctx.businessName });
  const subject = c.subject[type]({
    service: ctx.serviceName,
    business: ctx.businessName,
    when,
    customer: ctx.customerName,
  });
  const heading = c.heading[type];

  const text = [
    heading,
    '',
    intro,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    ...links.map(([k, v]) => `${k}: ${v}`),
    '',
    c.footer(ctx.businessName),
  ].join('\n');

  const dir = rtl ? 'rtl' : 'ltr';
  const align = rtl ? 'right' : 'left';
  const html = `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Tahoma,Arial,sans-serif;direction:${dir};text-align:${align};color:#1b2430">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dir}" style="background:#f4f6f8;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" dir="${dir}" style="max-width:100%;background:#ffffff;border-radius:12px;padding:28px;direction:${dir};text-align:${align}">
<tr><td style="font-size:22px;font-weight:bold;padding-bottom:8px;text-align:${align}">${esc(heading)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;padding-bottom:16px;text-align:${align}">${esc(intro)}</td></tr>
<tr><td>
<table role="presentation" width="100%" cellpadding="8" cellspacing="0" dir="${dir}" style="border:1px solid #e3e8ee;border-radius:8px;font-size:14px">
${rows
  .map(
    ([k, v]) =>
      `<tr><td style="color:#5b6776;width:35%;text-align:${align}">${esc(k)}</td><td style="font-weight:bold;text-align:${align}">${esc(v)}</td></tr>`,
  )
  .join('\n')}
</table>
</td></tr>
${links
  .map(
    ([k, v], i) =>
      `<tr><td style="padding-top:14px;text-align:${align}"><a href="${esc(v)}" style="display:inline-block;${
        i === 0
          ? 'background:#0f766e;color:#ffffff;padding:10px 18px;border-radius:8px;'
          : 'color:#0f766e;'
      }text-decoration:none;font-size:14px">${esc(k)}</a></td></tr>`,
  )
  .join('\n')}
<tr><td style="font-size:12px;color:#8a94a3;padding-top:22px;text-align:${align}">${esc(c.footer(ctx.businessName))}</td></tr>
</table></td></tr></table>
</body></html>`;

  return { subject, text, html };
}
