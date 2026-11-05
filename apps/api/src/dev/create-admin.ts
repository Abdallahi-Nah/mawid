// Creates (or resets the password of) an ADMIN account. There is no sign-up for administrators on purpose.
// Usage:   ADMIN_PASSWORD='a long password' node dist/dev/create-admin.js admin@example.com
// Without ADMIN_PASSWORD a random password is generated and printed once. Not used by the application itself.
import 'dotenv/config';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('Usage: ADMIN_PASSWORD=... node dist/dev/create-admin.js admin@example.com');
    process.exit(1);
  }
  const given = process.env.ADMIN_PASSWORD;
  if (given !== undefined && given.length < 12) {
    console.error('ADMIN_PASSWORD must have at least 12 characters.');
    process.exit(1);
  }
  const password = given ?? randomBytes(15).toString('base64url');
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.role !== 'ADMIN') {
      console.error(`${email} already exists with the role ${existing.role}. Use another email.`);
      process.exit(1);
    }
    await prisma.user.upsert({
      where: { email },
      update: { passwordHash },
      create: { email, name: 'Administrator', passwordHash, role: 'ADMIN', locale: 'fr' },
    });
    console.log(`${existing ? 'Password reset for' : 'Created'} admin ${email}`);
    if (given === undefined)
      console.log(`Password (shown once, change it after login): ${password}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
