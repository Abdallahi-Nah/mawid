// Demo environment: 2 invented businesses (an Arabic beauty salon and a French clinic) with logos, team photos,
// services, about 6 weeks of bookings, deposits and reviews. Everything is invented; the names, phone numbers and
// emails are fake. Running it again DELETES the demo data and recreates it, so it is also the "reset" button.
//
//   development:  pnpm --filter api db:demo
//   production:   node dist/dev/demo-data.js          (inside the API container or on the server)
//   only delete:  ... --reset-only
//
// Demo accounts (password for all: Demo1234!):
//   demo.salon@demo.mawid.test   owner of the Arabic salon       -> /ar/b/demo-salon
//   demo.clinic@demo.mawid.test  owner of the French clinic      -> /fr/b/demo-clinique
//   demo.admin@demo.mawid.test   administrator                   -> /fr/admin
// The script only touches rows with these emails and slugs: your real data is never deleted. Not used by the app.
import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaClient, type BookingStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';

const PASSWORD = 'Demo1234!';
const DOMAIN = '@demo.mawid.test';
const TZ = 'Africa/Nouakchott'; // UTC+0, no daylight saving
const ASSETS = resolve(__dirname, '../../prisma/demo-assets');
const prisma = new PrismaClient();

// --- a small seeded random generator: the same demo every time -----------------------------------------------------
let seed = 20261105;
const rnd = (): number => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)];
const chance = (p: number): boolean => rnd() < p;

interface Service {
  name: string;
  description: string;
  durationMin: number;
  price: number;
  category: string;
  bufferMin?: number;
  depositAmount?: number;
}
interface Demo {
  slug: string;
  owner: { email: string; name: string };
  business: {
    name: string;
    description: string;
    address: string;
    phone: string;
    category: string;
    defaultLocale: 'ar' | 'fr';
    brandColor: string;
    bookingMode: 'AUTO' | 'MANUAL';
    bufferMin: number;
    paymentInstructions: string;
  };
  logo: string;
  services: Service[];
  staff: { name: string; photo: string; services: string[] }[];
  hours: { start: string; end: string; breakStart: string; breakEnd: string };
  customers: string[];
  comments: { rating: number; text: string }[];
  replies: string[];
  notes: string[];
}

const DEMOS: Demo[] = [
  {
    slug: 'demo-salon',
    owner: { email: `demo.salon${DOMAIN}`, name: 'ليلى منت أحمد' },
    business: {
      name: 'صالون ليلى',
      description:
        'صالون نسائي في تفرغ زينة بنواكشوط. قص وتسريحات وصبغات وعناية بالشعر والأظافر في أجواء هادئة ومريحة، بالموعد المسبق وبدون انتظار.',
      address: 'تفرغ زينة، شارع الجيش، نواكشوط',
      phone: '+222 36 12 45 78',
      category: 'salon',
      defaultLocale: 'ar',
      brandColor: '#be185d',
      bookingMode: 'AUTO',
      bufferMin: 10,
      paymentInstructions:
        'بنكيلي: 36 12 45 78\nمصرفي: 36 12 45 78\nأرسلي المرجع أو لقطة الشاشة بعد الدفع.',
    },
    logo: 'logo-salon.png',
    services: [
      {
        name: 'قص الشعر',
        description: 'قص وتصفيف مع غسيل.',
        durationMin: 45,
        price: 250,
        category: 'الشعر',
      },
      {
        name: 'صبغة كاملة',
        description: 'صبغة بألوان عصرية مع العناية.',
        durationMin: 120,
        price: 700,
        category: 'الشعر',
        bufferMin: 15,
        depositAmount: 200,
      },
      {
        name: 'تسريحة مناسبات',
        description: 'تسريحة للأعراس والحفلات.',
        durationMin: 90,
        price: 900,
        category: 'الشعر',
        depositAmount: 300,
      },
      {
        name: 'علاج الكيراتين',
        description: 'علاج عميق لنعومة ولمعان الشعر.',
        durationMin: 150,
        price: 1500,
        category: 'العناية',
        bufferMin: 15,
        depositAmount: 400,
      },
      {
        name: 'مانيكير وباديكير',
        description: 'عناية كاملة بالأظافر.',
        durationMin: 60,
        price: 300,
        category: 'الأظافر',
      },
      {
        name: 'حمّام مغربي',
        description: 'حمّام تقليدي وتدليك.',
        durationMin: 75,
        price: 500,
        category: 'العناية',
      },
    ],
    staff: [
      {
        name: 'ليلى منت أحمد',
        photo: 'avatar-salon-1.png',
        services: ['قص الشعر', 'صبغة كاملة', 'تسريحة مناسبات', 'علاج الكيراتين'],
      },
      {
        name: 'مريم بنت سيدي',
        photo: 'avatar-salon-2.png',
        services: ['قص الشعر', 'مانيكير وباديكير', 'حمّام مغربي', 'تسريحة مناسبات'],
      },
      {
        name: 'خديجة منت المختار',
        photo: 'avatar-salon-3.png',
        services: ['مانيكير وباديكير', 'حمّام مغربي', 'علاج الكيراتين'],
      },
    ],
    hours: { start: '09:00', end: '19:00', breakStart: '13:00', breakEnd: '14:30' },
    customers: [
      'فاطمة منت محمد',
      'عائشة بنت إبراهيم',
      'مريم منت سيدي',
      'آمنة بنت أحمد',
      'خديجة منت الشيخ',
      'زينب بنت عبد الله',
      'سكينة منت محمد فال',
      'ماريّة بنت يحيى',
      'حواء منت بابا',
      'هند بنت المختار',
      'سلمى منت أعمر',
      'رقية بنت الداه',
      'نجاة منت سالم',
      'أم كلثوم بنت محمد',
      'لالة منت عبد الرحمن',
      'مباركة بنت سيدي محمد',
      'فاطمتو منت الحسن',
      'خيرة بنت محمد الأمين',
      'مينة منت اباه',
      'عيشة بنت أبو',
    ],
    comments: [
      { rating: 5, text: 'خدمة ممتازة ونتيجة رائعة، سأعود بالتأكيد.' },
      { rating: 5, text: 'ليلى محترفة جدًا والصالون نظيف ومرتب.' },
      { rating: 5, text: 'تسريحة العرس كانت أجمل مما توقعت، شكرًا جزيلًا.' },
      { rating: 4, text: 'عمل جيد، لكن كان هناك تأخير بسيط في الموعد.' },
      { rating: 5, text: 'علاج الكيراتين غيّر شعري تمامًا!' },
      { rating: 4, text: 'أسعار معقولة وأجواء مريحة.' },
      { rating: 5, text: 'الحجز عبر الموقع سهل وسريع جدًا.' },
      { rating: 3, text: 'الخدمة جيدة لكن الانتظار طال قليلًا.' },
      { rating: 5, text: 'مريم ماهرة في الأظافر، أنصح بها.' },
      { rating: 2, text: 'الصبغة لم تكن بالدرجة التي طلبتها.' },
    ],
    replies: [
      'شكرًا لك على كلماتك الطيبة، ننتظرك دائمًا!',
      'نعتذر عن التأخير وسنعمل على تحسين التنظيم، شكرًا لملاحظتك.',
      'يسعدنا أن النتيجة أعجبتك، إلى اللقاء قريبًا.',
    ],
    notes: ['تفضّل صبغة داكنة', 'حساسية من بعض المنتجات', 'تأتي مع ابنتها', ''],
  },
  {
    slug: 'demo-clinique',
    owner: { email: `demo.clinic${DOMAIN}`, name: 'Dr Fatimetou Mint Sidi' },
    business: {
      name: 'Clinique Al Chifa',
      description:
        'Clinique de quartier à Tevragh Zeina, Nouakchott. Médecine générale, pédiatrie, vaccinations et bilans de santé. Sur rendez-vous, avec confirmation par le médecin.',
      address: 'Tevragh Zeina, rue 42-045, Nouakchott',
      phone: '+222 45 23 67 89',
      category: 'clinic',
      defaultLocale: 'fr',
      brandColor: '#0d9488',
      bookingMode: 'MANUAL',
      bufferMin: 5,
      paymentInstructions:
        "Bankily : 45 23 67 89 (Clinique Al Chifa)\nEnvoyez la référence de la transaction ou une capture d'écran.",
    },
    logo: 'logo-clinic.png',
    services: [
      {
        name: 'Consultation générale',
        description: 'Consultation avec un médecin généraliste.',
        durationMin: 30,
        price: 500,
        category: 'Consultations',
        depositAmount: 100,
      },
      {
        name: 'Suivi pédiatrique',
        description: 'Suivi de la croissance et conseils aux parents.',
        durationMin: 30,
        price: 600,
        category: 'Consultations',
        depositAmount: 100,
      },
      {
        name: 'Bilan de santé',
        description: 'Examen complet et conseils personnalisés.',
        durationMin: 60,
        price: 1200,
        category: 'Prévention',
        bufferMin: 10,
        depositAmount: 300,
      },
      {
        name: 'Vaccination',
        description: 'Vaccins du calendrier et vaccins voyageur.',
        durationMin: 15,
        price: 300,
        category: 'Prévention',
      },
      {
        name: 'Échographie',
        description: 'Échographie abdominale ou obstétricale.',
        durationMin: 30,
        price: 1500,
        category: 'Imagerie',
        bufferMin: 10,
        depositAmount: 300,
      },
    ],
    staff: [
      {
        name: 'Dr Fatimetou Mint Sidi',
        photo: 'avatar-clinic-1.png',
        services: ['Consultation générale', 'Bilan de santé', 'Vaccination'],
      },
      {
        name: 'Dr Cheikh Ould Brahim',
        photo: 'avatar-clinic-2.png',
        services: ['Consultation générale', 'Suivi pédiatrique', 'Échographie', 'Vaccination'],
      },
    ],
    hours: { start: '08:00', end: '17:00', breakStart: '12:30', breakEnd: '14:00' },
    customers: [
      'Mohamed Ould Ahmed',
      'Aminetou Mint Sidi',
      'Sidi Ould Brahim',
      'Khadija Mint Mohamed',
      'Ahmed Salem Ould Baba',
      'Mariem Mint Cheikh',
      'Abdallahi Ould Mohamed',
      'Zeinebou Mint Ely',
      'Yahya Ould Sidi',
      'Fatimetou Mint Abdallahi',
      'Brahim Ould Mohamed Lemine',
      'Oumou Mint Bilal',
      'Mamadou Ba',
      'Aïssata Diallo',
      'Lalla Mint Hamady',
      'Moctar Ould Daddah',
      'Selma Mint Ahmed Vall',
      'Ismaïl Ould Saleck',
      'Nana Mint Mohamed',
      'Cheikh Ould Abdallahi',
    ],
    comments: [
      { rating: 5, text: "Médecin très à l'écoute, consultation rapide et claire. Je recommande." },
      { rating: 5, text: 'Excellent suivi pour mon fils, le Dr Cheikh est patient et rassurant.' },
      { rating: 4, text: 'Bon accueil et prise de rendez-vous très pratique en ligne.' },
      { rating: 5, text: 'Bilan de santé complet, résultats expliqués simplement. Merci !' },
      { rating: 3, text: "Bonne consultation mais un peu d'attente malgré le rendez-vous." },
      { rating: 5, text: 'Clinique propre, personnel aimable. Je reviendrai.' },
      { rating: 4, text: 'Échographie bien faite, explications claires.' },
      { rating: 5, text: "Le rappel par email m'a évité d'oublier le rendez-vous." },
      { rating: 4, text: 'Tarifs raisonnables et horaires pratiques.' },
      { rating: 2, text: 'Rendez-vous décalé de 30 minutes sans prévenir.' },
    ],
    replies: [
      'Merci pour votre confiance, à très bientôt à la clinique.',
      "Nous sommes désolés pour l'attente : nous améliorons notre organisation. Merci de votre retour.",
      'Merci Madame, ravie que le suivi vous convienne.',
    ],
    notes: ['Allergie à la pénicilline', 'Diabète de type 2', 'Vaccins à jour', ''],
  },
];

// -------------------------------------------------------------------------------------------------------------------
const toMin = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const uploadRoot = (): string => resolve(process.env.UPLOAD_DIR ?? 'uploads');
const apiUrl = (): string => process.env.API_URL ?? 'http://localhost:4000';

/** Copies an illustration into the upload folder and returns its public URL (same layout as a real upload). */
function publish(businessId: string, folder: string, file: string): string {
  const src = join(ASSETS, file);
  if (!existsSync(src))
    throw new Error(`Missing demo image ${src}. Run: node apps/web/scripts/build-demo-assets.mjs`);
  const name = `${randomUUID()}.png`;
  const dir = join(uploadRoot(), businessId, folder);
  mkdirSync(dir, { recursive: true });
  copyFileSync(src, join(dir, name));
  return `${apiUrl()}/uploads/${businessId}/${folder}/${name}`;
}

async function reset(): Promise<void> {
  const businesses = await prisma.business.findMany({
    where: { slug: { in: DEMOS.map((d) => d.slug) } },
    select: { id: true },
  });
  // Cascade rules remove staff, services, customers, bookings, payments, reviews and notifications with the business.
  await prisma.business.deleteMany({ where: { id: { in: businesses.map((b) => b.id) } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  for (const b of businesses) rmSync(join(uploadRoot(), b.id), { recursive: true, force: true });
}

async function create(
  d: Demo,
  passwordHash: string,
): Promise<{ bookings: number; reviews: number }> {
  const business = await prisma.business.create({
    data: {
      slug: d.slug,
      ...d.business,
      timezone: TZ,
      plan: 'PRO',
      minNoticeHours: 1,
      maxDaysAhead: 60,
    },
  });
  await prisma.business.update({
    where: { id: business.id },
    data: { logoUrl: publish(business.id, 'logo', d.logo) },
  });
  await prisma.user.create({
    data: {
      email: d.owner.email,
      name: d.owner.name,
      passwordHash,
      role: 'OWNER',
      locale: d.business.defaultLocale,
      businessId: business.id,
    },
  });

  const services = new Map<string, { id: string; s: Service }>();
  for (const s of d.services) {
    const row = await prisma.service.create({
      data: {
        businessId: business.id,
        name: s.name,
        description: s.description,
        durationMin: s.durationMin,
        price: s.price,
        category: s.category,
        bufferMin: s.bufferMin ?? 0,
        depositAmount: s.depositAmount ?? null,
      },
    });
    services.set(s.name, { id: row.id, s });
  }
  const team: { id: string; services: string[] }[] = [];
  for (const m of d.staff) {
    const st = await prisma.staff.create({
      data: {
        businessId: business.id,
        displayName: m.name,
        photoUrl: publish(business.id, 'staff', m.photo),
      },
    });
    await prisma.staffService.createMany({
      data: m.services.map((n) => ({
        staffId: st.id,
        serviceId: services.get(n)!.id,
        businessId: business.id,
      })),
    });
    // Sunday..Thursday and Saturday open, Friday closed (weekday 5).
    await prisma.workingHours.createMany({
      data: [0, 1, 2, 3, 4, 6].map((weekday) => ({
        businessId: business.id,
        staffId: st.id,
        weekday,
        startTime: d.hours.start,
        endTime: d.hours.end,
        breakStart: d.hours.breakStart,
        breakEnd: d.hours.breakEnd,
      })),
    });
    team.push({ id: st.id, services: m.services });
  }

  const customers = await Promise.all(
    d.customers.map((name, i) =>
      prisma.customer.create({
        data: {
          businessId: business.id,
          name,
          // 8 digits like a Mauritanian number, different for every customer of the business
          phone: `+222${[2, 3, 4][i % 3]}${String(1000000 + ((i * 7919 + 13) % 8999999)).padStart(7, '0')}`,
          email: chance(0.45) ? `client${i + 1}.${d.slug}@example.com` : null,
          notes: chance(0.25) ? pick(d.notes) || null : null,
        },
      }),
    ),
  );

  // ---- bookings: 6 weeks back to 2 weeks ahead, never overlapping (the database would refuse it) ----
  const now = DateTime.now().setZone(TZ);
  const busy = new Map<string, [number, number][]>(); // staffId + day -> occupied minutes
  let bookingCount = 0;
  let reviewCount = 0;
  const counters = new Map<string, { visits: number; noShow: number }>();
  const completed: { id: string; customerId: string }[] = [];

  for (let offset = -42; offset <= 14; offset++) {
    const day = now.plus({ days: offset }).startOf('day');
    if (day.weekday === 5) continue; // Friday (luxon: 1 = Monday ... 5 = Friday)
    for (const m of team) {
      const perDay = offset < 0 ? 2 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < perDay; k++) {
        const svcName = pick(m.services);
        const { id: serviceId, s } = services.get(svcName)!;
        const length = s.durationMin + (s.bufferMin ?? 0) + d.business.bufferMin;
        const from = toMin(d.hours.start);
        const to = toMin(d.hours.end);
        const start = from + Math.floor(rnd() * ((to - from - s.durationMin) / 15)) * 15;
        const end = start + length;
        const inBreak =
          start < toMin(d.hours.breakEnd) && start + s.durationMin > toMin(d.hours.breakStart);
        const key = `${m.id}|${day.toISODate()}`;
        const taken = busy.get(key) ?? [];
        if (inBreak || start + s.durationMin > to || taken.some(([a, b]) => start < b && end > a))
          continue;
        busy.set(key, [...taken, [start, end]]);

        const startsAt = day.plus({ minutes: start });
        if (offset === 0 && startsAt < now) continue;
        const past = startsAt < now;
        let status: BookingStatus;
        if (past) {
          const r = rnd();
          status =
            r < 0.72 ? 'COMPLETED' : r < 0.84 ? 'CANCELLED' : r < 0.92 ? 'NO_SHOW' : 'COMPLETED';
        } else {
          status = d.business.bookingMode === 'MANUAL' && chance(0.4) ? 'PENDING' : 'CONFIRMED';
        }
        const needsDeposit = (s.depositAmount ?? 0) > 0;
        // A booking with a deposit that is still waiting for the owner stays PENDING.
        const waitingPayment = needsDeposit && !past && status !== 'CANCELLED' && chance(0.35);
        if (waitingPayment) status = 'PENDING';
        const customer = pick(customers);
        // booked 1 to 5 days before the appointment (never in the future)
        const bookedAt = startsAt.minus({ days: 1 + Math.floor(rnd() * 5) });
        const createdAt = (bookedAt > now ? now : bookedAt).toUTC().toJSDate();
        const startUtc = startsAt.toUTC().toJSDate();
        const booking = await prisma.booking.create({
          data: {
            businessId: business.id,
            customerId: customer.id,
            staffId: m.id,
            serviceId,
            startsAt: startUtc,
            endsAt: startsAt.plus({ minutes: s.durationMin }).toUTC().toJSDate(),
            status,
            source: pick(['WEB', 'WEB', 'WEB', 'AI', 'MANUAL'] as const),
            price: s.price,
            bufferMin:
              (s.bufferMin ?? 0) > d.business.bufferMin ? (s.bufferMin ?? 0) : d.business.bufferMin,
            locale: d.business.defaultLocale,
            createdAt: createdAt,
          },
        });
        bookingCount++;
        if (needsDeposit && status !== 'CANCELLED') {
          await prisma.payment.create({
            data: {
              businessId: business.id,
              bookingId: booking.id,
              method: 'MOBILE',
              amount: s.depositAmount!,
              status: waitingPayment ? 'PENDING' : 'PAID',
              reference:
                waitingPayment && chance(0.3) ? null : `BK-${Math.floor(100000 + rnd() * 899999)}`,
              provider: 'manual',
              decidedAt: waitingPayment ? null : startsAt.minus({ days: 1 }).toUTC().toJSDate(),
            },
          });
        }
        const c = counters.get(customer.id) ?? { visits: 0, noShow: 0 };
        if (status === 'COMPLETED') {
          c.visits++;
          completed.push({ id: booking.id, customerId: customer.id });
        }
        if (status === 'NO_SHOW') c.noShow++;
        counters.set(customer.id, c);
      }
    }
  }
  for (const [id, c] of counters)
    await prisma.customer.update({
      where: { id },
      data: { visitsCount: c.visits, noShowCount: c.noShow },
    });

  // ---- reviews on about 40% of the completed visits, a few answered by the owner ----
  for (const v of completed) {
    if (!chance(0.4)) continue;
    const c = pick(d.comments);
    const replied = c.rating <= 3 || chance(0.25);
    await prisma.review.create({
      data: {
        businessId: business.id,
        bookingId: v.id,
        rating: c.rating,
        comment: c.text,
        reply: replied ? pick(d.replies) : null,
        repliedAt: replied ? now.minus({ days: Math.floor(rnd() * 5) }).toJSDate() : null,
        createdAt: now.minus({ days: Math.floor(rnd() * 40) }).toJSDate(),
      },
    });
    reviewCount++;
  }

  // ---- the bell: a few recent alerts, some unread ----
  const recent = await prisma.booking.findMany({
    where: { businessId: business.id, status: { in: ['CONFIRMED', 'PENDING'] } },
    orderBy: { createdAt: 'desc' },
    take: 6,
  });
  for (const [i, b] of recent.entries()) {
    await prisma.notification.create({
      data: {
        businessId: business.id,
        bookingId: b.id,
        channel: 'IN_APP',
        type: 'owner_new_booking',
        status: 'SENT',
        sentAt: now.minus({ hours: i * 5 }).toJSDate(),
        readAt: i > 2 ? now.toJSDate() : null,
        createdAt: now.minus({ hours: i * 5 }).toJSDate(),
      },
    });
  }

  // ---- AI usage of the last 30 days (invented numbers, so the admin screen has something to show) ----
  const logs = Array.from({ length: 24 }, (_, i) => {
    const big = chance(0.6);
    return {
      businessId: business.id,
      feature: pick(['chat', 'chat', 'chat', 'generate', 'reviews']),
      model: big ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant',
      tokensIn: 1200 + Math.floor(rnd() * 1800),
      tokensOut: 150 + Math.floor(rnd() * 350),
      latencyMs: 600 + Math.floor(rnd() * 1400),
      createdAt: now.minus({ days: Math.floor((i / 24) * 28) }).toJSDate(),
    };
  });
  await prisma.aiLog.createMany({ data: logs });
  return { bookings: bookingCount, reviews: reviewCount };
}

async function main(): Promise<void> {
  const onlyReset = process.argv.includes('--reset-only');
  await reset();
  if (onlyReset) {
    console.log('Demo data deleted.');
    return;
  }
  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  await prisma.user.create({
    data: {
      email: `demo.admin${DOMAIN}`,
      name: 'Admin Demo',
      passwordHash,
      role: 'ADMIN',
      locale: 'fr',
    },
  });
  for (const d of DEMOS) {
    const r = await create(d, passwordHash);
    console.log(
      `${d.business.name}: ${r.bookings} bookings, ${r.reviews} reviews  ->  /${d.business.defaultLocale}/b/${d.slug}`,
    );
  }
  console.log(`\nDemo accounts (password ${PASSWORD}):`);
  for (const d of DEMOS) console.log(`  ${d.owner.email}`);
  console.log(`  demo.admin${DOMAIN}  (administrator)`);
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
