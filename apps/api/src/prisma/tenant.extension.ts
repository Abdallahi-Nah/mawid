import { Prisma, PrismaClient } from '@prisma/client';

// Models that carry a business_id column. Business itself is scoped by its id.
export const TENANT_MODELS: ReadonlySet<string> = new Set([
  'User',
  'Staff',
  'Service',
  'StaffService',
  'WorkingHours',
  'TimeOff',
  'Customer',
  'Booking',
  'Payment',
  'Review',
  'Notification',
  'AiLog',
]);

type Args = Record<string, unknown>;

const WHERE_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
]);
const CREATE_OPS = new Set(['create', 'createMany', 'createManyAndReturn', 'upsert']);

const obj = (v: unknown): Args => (v && typeof v === 'object' ? (v as Args) : {});

/**
 * Forces the tenant on the arguments of a Prisma operation. The tenant always wins: a business_id passed
 * by the caller is overwritten, so code cannot read or write another tenant's rows by mistake.
 * Unknown models and operations are refused (fail closed).
 */
export function scopeArgs(
  model: string,
  operation: string,
  args: unknown,
  businessId: string,
): Args {
  const isBusiness = model === 'Business';
  if (!isBusiness && !TENANT_MODELS.has(model)) {
    throw new Error(
      `Model ${model} is not available on a tenant client. Use PrismaService directly.`,
    );
  }
  const key = isBusiness ? 'id' : 'businessId';
  const out: Args = { ...obj(args) };

  if (!WHERE_OPS.has(operation) && !CREATE_OPS.has(operation)) {
    throw new Error(`Operation ${operation} is not allowed on a tenant client.`);
  }
  if (WHERE_OPS.has(operation)) out.where = { ...obj(out.where), [key]: businessId };
  if (CREATE_OPS.has(operation)) {
    if (isBusiness) throw new Error('A tenant client cannot create businesses.');
    if (operation === 'upsert') {
      out.create = { ...obj(out.create), businessId };
    } else if (Array.isArray(out.data)) {
      out.data = out.data.map((d: unknown) => ({ ...obj(d), businessId }));
    } else {
      out.data = { ...obj(out.data), businessId };
    }
  }
  return out;
}

/**
 * Prisma client where every query is filtered by business_id.
 * Raw SQL ($queryRaw) is blocked. Ids of related rows (for example staffId) must still be checked
 * with this same client before use, because nested relation writes can point to another tenant.
 */
export function createTenantClient(prisma: PrismaClient, businessId: string) {
  return prisma.$extends({
    name: 'tenant',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(scopeArgs(model, operation, args, businessId) as typeof args);
        },
      },
      $queryRaw: () => {
        throw new Error('Raw queries are not allowed on a tenant client.');
      },
      $executeRaw: () => {
        throw new Error('Raw queries are not allowed on a tenant client.');
      },
    },
  });
}

export type TenantClient = ReturnType<typeof createTenantClient>;
export type { Prisma };
