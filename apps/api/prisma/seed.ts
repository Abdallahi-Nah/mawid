// Demo data: 2 invented businesses with owners, staff, services and working hours.
// Safe to run many times: it deletes and recreates the demo rows.
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const PASSWORD = 'Demo1234!';

interface Demo {
  slug: string;
  name: string;
  category: string;
  description: string;
  address: string;
  phone: string;
  owner: { email: string; name: string };
  services: {
    name: string;
    description: string;
    durationMin: number;
    price: number;
    category: string;
    bufferMin?: number;
  }[];
  staff: { name: string; serviceNames: string[] }[];
}

const demos: Demo[] = [
  {
    slug: 'salon-nour',
    name: 'Salon Nour',
    category: 'salon',
    description: 'Salon de coiffure familial à Nouakchott. Sur rendez-vous, sans attente.',
    address: 'Tevragh Zeina, Nouakchott',
    phone: '+222 22 00 11 22',
    owner: { email: 'owner.salon@mawid.demo', name: 'Mohamed Ould Ahmed' },
    services: [
      {
        name: 'Coupe de cheveux',
        description: 'Coupe et coiffage avec shampoing.',
        durationMin: 45,
        price: 300,
        category: 'Cheveux',
      },
      {
        name: 'Taille de barbe',
        description: 'Contours et soin à la serviette chaude.',
        durationMin: 20,
        price: 150,
        category: 'Barbe',
      },
      {
        name: 'Coloration',
        description: 'Coloration complète avec soin.',
        durationMin: 90,
        price: 800,
        category: 'Cheveux',
        bufferMin: 10,
      },
      {
        name: 'Soin du visage',
        description: 'Nettoyage et hydratation profonde.',
        durationMin: 60,
        price: 500,
        category: 'Soins',
      },
    ],
    staff: [
      { name: 'Sidi Mohamed', serviceNames: ['Coupe de cheveux', 'Taille de barbe'] },
      {
        name: 'Mariem Mint Ahmed',
        serviceNames: ['Coupe de cheveux', 'Coloration', 'Soin du visage'],
      },
      { name: 'Ahmed Ould Baba', serviceNames: ['Coloration', 'Taille de barbe'] },
    ],
  },
  {
    slug: 'clinique-al-chifa',
    name: 'Clinique Al Chifa',
    category: 'clinic',
    description: 'Cabinet médical : consultations générales et suivi des enfants.',
    address: 'Ksar, Nouakchott',
    phone: '+222 33 44 55 66',
    owner: { email: 'owner.clinic@mawid.demo', name: 'Dr Fatimetou Mint Sidi' },
    services: [
      {
        name: 'Consultation générale',
        description: 'Consultation de 30 minutes.',
        durationMin: 30,
        price: 600,
        category: 'Consultation',
        bufferMin: 5,
      },
      {
        name: 'Suivi pédiatrique',
        description: 'Contrôle de croissance et vaccins.',
        durationMin: 30,
        price: 700,
        category: 'Enfants',
        bufferMin: 5,
      },
      {
        name: 'Bilan de santé',
        description: 'Examen complet et conseils.',
        durationMin: 60,
        price: 1200,
        category: 'Prévention',
      },
    ],
    staff: [
      { name: 'Dr Fatimetou Mint Sidi', serviceNames: ['Consultation générale', 'Bilan de santé'] },
      {
        name: 'Dr Cheikh Ould Brahim',
        serviceNames: ['Consultation générale', 'Suivi pédiatrique'],
      },
    ],
  },
];

// 0 = Sunday ... 6 = Saturday. Friday (5) is closed.
const OPEN_DAYS = [0, 1, 2, 3, 4, 6];

async function main(): Promise<void> {
  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@mawid.demo' } } });
  await prisma.business.deleteMany({ where: { slug: { in: demos.map((d) => d.slug) } } });

  for (const d of demos) {
    const business = await prisma.business.create({
      data: {
        name: d.name,
        slug: d.slug,
        category: d.category,
        description: d.description,
        address: d.address,
        phone: d.phone,
        defaultLocale: 'fr',
      },
    });
    await prisma.user.create({
      data: {
        email: d.owner.email,
        name: d.owner.name,
        passwordHash,
        role: 'OWNER',
        locale: 'fr',
        businessId: business.id,
      },
    });
    const services = new Map<string, string>();
    for (const s of d.services) {
      const row = await prisma.service.create({ data: { ...s, businessId: business.id } });
      services.set(s.name, row.id);
    }
    for (const s of d.staff) {
      const staff = await prisma.staff.create({
        data: { displayName: s.name, businessId: business.id },
      });
      await prisma.staffService.createMany({
        data: s.serviceNames.map((n) => ({
          staffId: staff.id,
          serviceId: services.get(n) as string,
          businessId: business.id,
        })),
      });
      await prisma.workingHours.createMany({
        data: OPEN_DAYS.map((weekday) => ({
          businessId: business.id,
          staffId: staff.id,
          weekday,
          startTime: '09:00',
          endTime: '18:00',
          breakStart: '13:00',
          breakEnd: '14:00',
        })),
      });
    }
  }

  const admin = 'admin@mawid.demo';
  await prisma.user.create({
    data: { email: admin, name: 'Admin Mawid', passwordHash, role: 'ADMIN', locale: 'fr' },
  });

  // eslint-disable-next-line no-console
  console.log(
    ['', 'Demo accounts (password for all: ' + PASSWORD + ')']
      .concat(demos.map((d) => `  OWNER  ${d.owner.email}  ->  /b/${d.slug}`))
      .concat([`  ADMIN  ${admin}`, ''])
      .join('\n'),
  );
}

main()
  .catch((e: unknown) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
