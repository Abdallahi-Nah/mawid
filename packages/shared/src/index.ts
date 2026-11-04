import { z } from 'zod';

export const errorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

// Error messages are translation keys (the UI translates them under form.errors.*).
export const customerDetailsSchema = z.object({
  name: z.string().trim().min(2, 'required'),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{8,15}$/, 'invalidPhone'),
  email: z
    .string()
    .trim()
    .refine((v) => v === '' || z.string().email().safeParse(v).success, 'invalidEmail'),
});
export type CustomerDetails = z.infer<typeof customerDetailsSchema>;

// Auth and onboarding forms (error messages are translation keys under form.errors.*).
export const loginSchema = z.object({
  email: z.string().trim().email('invalidEmail'),
  password: z.string().min(1, 'required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'required'),
  email: z.string().trim().email('invalidEmail'),
  password: z.string().min(8, 'passwordShort'),
  terms: z.literal(true, { errorMap: () => ({ message: 'termsRequired' }) }),
  locale: z.enum(['ar', 'fr', 'en']).optional(), // language of the interface, used for emails
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const onboardingBusinessSchema = z.object({
  name: z.string().trim().min(2, 'required'),
  category: z.enum(['salon', 'clinic', 'garage', 'restaurant'], {
    errorMap: () => ({ message: 'required' }),
  }),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{8,15}$/, 'invalidPhone'),
});
export type OnboardingBusinessInput = z.infer<typeof onboardingBusinessSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('invalidEmail'),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'required'),
  password: z.string().min(8, 'passwordShort'),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ---------------------------------------------------------------------------------------------
// Business, services, staff, working hours, time off (phase 2). Messages are translation keys.
// ---------------------------------------------------------------------------------------------
export const LOCALES = ['ar', 'fr', 'en'] as const;
export const BUSINESS_CATEGORIES = ['salon', 'clinic', 'garage', 'restaurant'] as const;

const phoneRegex = /^\+?[0-9 ]{8,15}$/;
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
const emptyToNull = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? null : v);

const isTimezone = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'slugInvalid')
  .max(40, 'slugInvalid')
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slugInvalid');

export const updateBusinessSchema = z
  .object({
    name: z.string().trim().min(2, 'required').max(80, 'tooLong'),
    slug: slugSchema,
    description: z.preprocess(emptyToNull, z.string().trim().max(500, 'tooLong').nullable()),
    address: z.preprocess(emptyToNull, z.string().trim().max(200, 'tooLong').nullable()),
    phone: z.preprocess(
      emptyToNull,
      z.string().trim().regex(phoneRegex, 'invalidPhone').nullable(),
    ),
    category: z.enum(BUSINESS_CATEGORIES, { errorMap: () => ({ message: 'required' }) }),
    timezone: z.string().refine(isTimezone, 'invalidTimezone'),
    defaultLocale: z.enum(LOCALES),
    brandColor: z.preprocess(
      emptyToNull,
      z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, 'invalidColor')
        .nullable(),
    ),
    bookingMode: z.enum(['AUTO', 'MANUAL']),
    cancelLimitHours: z
      .number({ invalid_type_error: 'required' })
      .int('required')
      .min(0, 'required')
      .max(720, 'required'),
  })
  .partial();
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;

export const serviceInputSchema = z.object({
  name: z.string().trim().min(2, 'required').max(80, 'tooLong'),
  description: z.preprocess(
    emptyToNull,
    z.string().trim().max(500, 'tooLong').nullable().optional(),
  ),
  durationMin: z
    .number({ invalid_type_error: 'durationInvalid', required_error: 'durationInvalid' })
    .int('durationInvalid')
    .min(5, 'durationInvalid')
    .max(480, 'durationInvalid'),
  price: z
    .number({ invalid_type_error: 'priceInvalid', required_error: 'priceInvalid' })
    .min(0, 'priceInvalid')
    .max(10_000_000, 'priceInvalid'),
  category: z.preprocess(emptyToNull, z.string().trim().max(50, 'tooLong').nullable().optional()),
  bufferMin: z
    .number({ invalid_type_error: 'required' })
    .int('required')
    .min(0, 'required')
    .max(120, 'required')
    .default(0),
  active: z.boolean().default(true),
});
export type ServiceInput = z.infer<typeof serviceInputSchema>;
export const serviceUpdateSchema = serviceInputSchema.partial();
export type ServiceUpdateInput = z.infer<typeof serviceUpdateSchema>;

export const staffInputSchema = z.object({
  displayName: z.string().trim().min(2, 'required').max(80, 'tooLong'),
  active: z.boolean().default(true),
  serviceIds: z.array(z.string().uuid()).max(100).default([]),
});
export type StaffInput = z.infer<typeof staffInputSchema>;
export const staffUpdateSchema = staffInputSchema.partial();
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;

const toMin = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const timeField = z.string().regex(timeRegex, 'timeInvalid');

export const workingHoursRowSchema = z
  .object({
    weekday: z.number().int().min(0).max(6), // 0 = Sunday
    startTime: timeField,
    endTime: timeField,
    breakStart: z.preprocess(emptyToNull, timeField.nullable().optional()),
    breakEnd: z.preprocess(emptyToNull, timeField.nullable().optional()),
  })
  .superRefine((r, ctx) => {
    if (toMin(r.endTime) <= toMin(r.startTime)) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'endBeforeStart' });
    }
    const hasBreak = !!r.breakStart || !!r.breakEnd;
    if (hasBreak) {
      const ok =
        !!r.breakStart &&
        !!r.breakEnd &&
        toMin(r.breakStart) < toMin(r.breakEnd) &&
        toMin(r.breakStart) >= toMin(r.startTime) &&
        toMin(r.breakEnd) <= toMin(r.endTime);
      if (!ok) ctx.addIssue({ code: 'custom', path: ['breakStart'], message: 'breakInvalid' });
    }
  });
export type WorkingHoursRow = z.infer<typeof workingHoursRowSchema>;

/** The whole weekly schedule of one employee. Several ranges per day are allowed but must not overlap. */
export const workingHoursSchema = z
  .array(workingHoursRowSchema)
  .max(42)
  .superRefine((rows, ctx) => {
    const byDay = new Map<number, WorkingHoursRow[]>();
    for (const r of rows) byDay.set(r.weekday, [...(byDay.get(r.weekday) ?? []), r]);
    for (const list of byDay.values()) {
      const sorted = [...list].sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
      for (let i = 1; i < sorted.length; i++) {
        if (toMin(sorted[i].startTime) < toMin(sorted[i - 1].endTime)) {
          ctx.addIssue({ code: 'custom', message: 'hoursOverlap' });
        }
      }
    }
  });

const timeOffObject = z.object({
  staffId: z.string().uuid().nullable().optional(), // null = the whole business is closed
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  reason: z.preprocess(emptyToNull, z.string().trim().max(200, 'tooLong').nullable().optional()),
});
const endAfterStart = (v: { startsAt?: string; endsAt?: string }): boolean =>
  !v.startsAt || !v.endsAt || new Date(v.endsAt) > new Date(v.startsAt);
export const timeOffInputSchema = timeOffObject.refine(endAfterStart, {
  path: ['endsAt'],
  message: 'endBeforeStart',
});
export const timeOffUpdateSchema = timeOffObject
  .partial()
  .refine(endAfterStart, { path: ['endsAt'], message: 'endBeforeStart' });
export type TimeOffUpdateInput = z.infer<typeof timeOffUpdateSchema>;
export type TimeOffInput = z.infer<typeof timeOffInputSchema>;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof paginationSchema>;
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Public business page (no private data).
export interface PublicBusiness {
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  address: string | null;
  phone: string | null;
  category: string | null;
  timezone: string;
  defaultLocale: string;
  brandColor: string | null;
  bookingMode: 'AUTO' | 'MANUAL';
  services: {
    id: string;
    name: string;
    description: string | null;
    durationMin: number;
    price: number;
    category: string | null;
  }[];
  staff: {
    id: string;
    displayName: string;
    photoUrl: string | null;
    serviceIds: string[];
    workingHours: { weekday: number; startTime: string; endTime: string }[];
  }[];
}
