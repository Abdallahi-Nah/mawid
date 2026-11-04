import 'dotenv/config';
import { PrismaService } from './prisma.service';

// Proves the tenant client isolates businesses on a real database (base for the AC-07 route tests).
describe('tenant client (integration, needs the database)', () => {
  const prisma = new PrismaService();
  let a: string;
  let b: string;
  let serviceB: string;

  beforeAll(async () => {
    await prisma.$connect();
    const tag = Date.now().toString(36);
    a = (await prisma.business.create({ data: { name: 'A', slug: `tenant-a-${tag}` } })).id;
    b = (await prisma.business.create({ data: { name: 'B', slug: `tenant-b-${tag}` } })).id;
    await prisma.service.create({
      data: { businessId: a, name: 'Service A', durationMin: 30, price: 100 },
    });
    serviceB = (
      await prisma.service.create({
        data: { businessId: b, name: 'Service B', durationMin: 30, price: 100 },
      })
    ).id;
  });
  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: [a, b] } } });
    await prisma.$disconnect();
  });

  it('lists only its own rows', async () => {
    const rows = await prisma.forTenant(a).service.findMany();
    expect(rows.map((r) => r.name)).toEqual(['Service A']);
  });

  it("cannot read, update or delete another business's row by id", async () => {
    const tenant = prisma.forTenant(a);
    expect(await tenant.service.findUnique({ where: { id: serviceB } })).toBeNull();
    await expect(
      tenant.service.update({ where: { id: serviceB }, data: { name: 'hacked' } }),
    ).rejects.toThrow();
    await expect(tenant.service.delete({ where: { id: serviceB } })).rejects.toThrow();
    expect(
      (await tenant.service.updateMany({ where: { id: serviceB }, data: { name: 'hacked' } }))
        .count,
    ).toBe(0);
    expect((await tenant.service.deleteMany({ where: { id: serviceB } })).count).toBe(0);
    const intact = await prisma.service.findUniqueOrThrow({ where: { id: serviceB } });
    expect(intact.name).toBe('Service B');
  });

  it('forces its business_id on creation even if the caller sends another one', async () => {
    const created = await prisma.forTenant(a).service.create({
      data: { name: 'Forced', durationMin: 10, price: 5, businessId: b } as never,
    });
    expect(created.businessId).toBe(a);
  });

  it('refuses raw queries and models without business_id', async () => {
    const tenant = prisma.forTenant(a);
    await expect(tenant.$queryRaw`SELECT 1`).rejects.toThrow(/not allowed/);
    await expect(
      (
        tenant as unknown as { refreshToken: { findMany: () => Promise<unknown> } }
      ).refreshToken.findMany(),
    ).rejects.toThrow(/not available/);
  });
});
