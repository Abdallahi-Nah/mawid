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
    minNoticeHours: z
      .number({ invalid_type_error: 'required' })
      .int('required')
      .min(0, 'required')
      .max(720, 'required'),
    maxDaysAhead: z
      .number({ invalid_type_error: 'required' })
      .int('required')
      .min(1, 'required')
      .max(365, 'required'),
    slotStepMin: z.union([
      z.literal(5),
      z.literal(10),
      z.literal(15),
      z.literal(20),
      z.literal(30),
      z.literal(60),
    ]),
    cancelLimitHours: z
      .number({ invalid_type_error: 'required' })
      .int('required')
      .min(0, 'required')
      .max(720, 'required'),
    // Preparation time after every appointment (a service can ask for more).
    bufferMin: z
      .number({ invalid_type_error: 'required' })
      .int('required')
      .min(0, 'required')
      .max(120, 'required'),
    // How to pay a deposit, shown to the customer.
    paymentInstructions: z.preprocess(
      emptyToNull,
      z.string().trim().max(300, 'tooLong').nullable(),
    ),
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
  // Deposit asked at booking time (null = none). Never more than the price (checked by the API).
  depositAmount: z
    .number({ invalid_type_error: 'priceInvalid' })
    .min(0, 'priceInvalid')
    .max(10_000_000, 'priceInvalid')
    .nullable()
    .optional(),
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
  /** Average of the reviews (1 decimal) and how many there are. null when there is no review yet. */
  ratingAverage: number | null;
  reviewCount: number;
  services: {
    id: string;
    name: string;
    description: string | null;
    durationMin: number;
    price: number;
    category: string | null;
    depositAmount: number | null;
  }[];
  staff: {
    id: string;
    displayName: string;
    photoUrl: string | null;
    serviceIds: string[];
    workingHours: { weekday: number; startTime: string; endTime: string }[];
  }[];
}

// ---------------------------------------------------------------------------------------------
// Bookings (phase 3)
// ---------------------------------------------------------------------------------------------
export const BOOKING_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const bookingStatusSchema = z.enum(BOOKING_STATUSES);

const isoDateTime = z.string().datetime({ offset: true });
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateInvalid');

export const slotsQuerySchema = z.object({
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().optional(), // omitted = any employee
  date: localDate, // a day in the business time zone
});
export type SlotsQuery = z.infer<typeof slotsQuerySchema>;

export interface Slot {
  start: string; // ISO UTC
  end: string;
}
export interface SlotsResponse {
  date: string;
  timezone: string;
  slots: Slot[];
}

/** Customer of a booking: the email is optional (the form can leave it out or empty). */
export const bookingCustomerSchema = customerDetailsSchema.extend({
  email: customerDetailsSchema.shape.email.optional(),
});

export const createBookingSchema = z.object({
  businessSlug: z.string().min(1).max(60),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().nullable().optional(), // null or omitted = any employee
  startsAt: isoDateTime,
  customer: bookingCustomerSchema,
  notes: z.preprocess(emptyToNull, z.string().trim().max(500, 'tooLong').nullable().optional()),
  locale: z.enum(LOCALES).optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const rescheduleSchema = z.object({ startsAt: isoDateTime });
export type RescheduleInput = z.infer<typeof rescheduleSchema>;

/** Owner or employee creates a booking (phone or walk-in customer). */
/** The owner may write down a customer who just walked in: a start up to this many minutes back is accepted. */
export const MANUAL_BOOKING_TOLERANCE_MIN = 15;

export const manualBookingSchema = z.object({
  serviceId: z.string().uuid(),
  staffId: z.string().uuid(),
  startsAt: isoDateTime,
  customer: bookingCustomerSchema,
  notes: z.preprocess(emptyToNull, z.string().trim().max(500, 'tooLong').nullable().optional()),
  status: z.enum(['PENDING', 'CONFIRMED']).default('CONFIRMED'),
});
export type ManualBookingInput = z.infer<typeof manualBookingSchema>;

export const moveBookingSchema = z.object({
  startsAt: isoDateTime,
  staffId: z.string().uuid().optional(),
});
export type MoveBookingInput = z.infer<typeof moveBookingSchema>;

export const updateStatusSchema = z.object({ status: bookingStatusSchema });
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

export const listBookingsSchema = z.object({
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  staffId: z.string().uuid().optional(),
  status: bookingStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
});
export type ListBookingsQuery = z.infer<typeof listBookingsSchema>;

/** What the customer sees after booking and on the cancel page. */
export interface PublicBookingView {
  id: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  price: number;
  cancelToken: string;
  service: { id: string; name: string; durationMin: number };
  staff: { id: string; displayName: string };
  business: {
    name: string;
    slug: string;
    timezone: string;
    address: string | null;
    phone: string | null;
  };
  /** false once the cancel limit has passed (or the booking is already closed). */
  canChange: boolean;
  cancelLimitHours: number;
  /** "Add to calendar": an .ics file (Apple, Outlook, Google) and a Google Calendar link. */
  icsUrl: string;
  googleCalendarUrl: string;
  /** Present when the service asks for a deposit. */
  deposit: DepositView | null;
}

// ---------------------------------------------------------------------------------------------
// Deposit (phase 5, FR-61)
// ---------------------------------------------------------------------------------------------
export const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface DepositView {
  amount: number;
  status: PaymentStatus;
  /** The customer already sent a reference or a screenshot (waiting for the owner when PENDING). */
  submitted: boolean;
  instructions: string | null;
}

/** Text part of the proof (the screenshot goes in the multipart field "file"). */
export const submitPaymentSchema = z.object({
  reference: z.preprocess(
    emptyToNull,
    z.string().trim().min(3, 'required').max(100, 'tooLong').nullable().optional(),
  ),
});
export type SubmitPaymentInput = z.infer<typeof submitPaymentSchema>;

export const listPaymentsSchema = z.object({
  status: z.enum(PAYMENT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListPaymentsQuery = z.infer<typeof listPaymentsSchema>;

export interface OwnerPayment {
  id: string;
  status: PaymentStatus;
  amount: number;
  reference: string | null;
  proofUrl: string | null;
  createdAt: string;
  booking: {
    id: string;
    status: BookingStatus;
    startsAt: string;
    customerName: string;
    customerPhone: string;
    serviceName: string;
  };
}

// ---------------------------------------------------------------------------------------------
// Reviews (phase 5, FR-71 and FR-72)
// ---------------------------------------------------------------------------------------------
export const createReviewSchema = z.object({
  rating: z
    .number({ invalid_type_error: 'required' })
    .int('required')
    .min(1, 'required')
    .max(5, 'required'),
  comment: z.preprocess(emptyToNull, z.string().trim().max(1000, 'tooLong').nullable().optional()),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const replyReviewSchema = z.object({
  reply: z.string().trim().min(1, 'required').max(1000, 'tooLong'),
});
export type ReplyReviewInput = z.infer<typeof replyReviewSchema>;

/** What the rating page needs (opened from the email link). */
export interface ReviewFormView {
  businessName: string;
  serviceName: string;
  startsAt: string;
  timezone: string;
  /** already rated: the page shows a thank-you instead of the form. */
  reviewed: boolean;
}

export interface PublicReview {
  id: string;
  rating: number;
  comment: string | null;
  /** First name and initial only. */
  author: string;
  reply: string | null;
  createdAt: string;
}
export interface PublicReviewsPage extends Page<PublicReview> {
  ratingAverage: number | null;
}

export interface OwnerReview extends PublicReview {
  customerName: string;
  serviceName: string;
  repliedAt: string | null;
}

// ---------------------------------------------------------------------------------------------
// Reports (phase 5, FR-80 to FR-82). Dates are days in the business time zone (YYYY-MM-DD).
// ---------------------------------------------------------------------------------------------
export const reportRangeSchema = z
  .object({
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateInvalid')
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateInvalid')
      .optional(),
  })
  .refine((r) => !r.from || !r.to || r.from <= r.to, { path: ['to'], message: 'endBeforeStart' });
export type ReportRangeQuery = z.infer<typeof reportRangeSchema>;

export interface ReportSummary {
  range: { from: string; to: string };
  today: number;
  thisWeek: number;
  total: number;
  /** Confirmed and completed bookings in the range, price added up. */
  estimatedRevenue: number;
  cancellationRate: number; // 0..1 of all bookings of the range
  noShowRate: number; // 0..1
  byStatus: Record<BookingStatus, number>;
  ratingAverage: number | null;
  reviewCount: number;
}
export interface BookingsPerDayPoint {
  date: string;
  bookings: number;
  revenue: number;
}
export interface TopService {
  serviceId: string;
  name: string;
  bookings: number;
  revenue: number;
}
export interface PeakHour {
  hour: number; // 0..23, local time
  bookings: number;
}

// ---------------------------------------------------------------------------------------------
// Plans (phase 5, FR-91)
// ---------------------------------------------------------------------------------------------
export interface PlanLimits {
  staff: number | null; // null = no limit
  bookingsPerMonth: number | null;
  aiMessagesPerMonth: number;
}
export interface PlanInfo {
  plan: 'FREE' | 'PRO' | 'BUSINESS';
  limits: PlanLimits;
  usage: { staff: number; bookingsThisMonth: number; aiMessagesThisMonth: number };
}

// ---------------------------------------------------------------------------------------------
// Customers and notifications (phase 3)
// ---------------------------------------------------------------------------------------------
export const listCustomersSchema = z.object({
  q: z.string().trim().max(80).optional(), // searches name, phone and email
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListCustomersQuery = z.infer<typeof listCustomersSchema>;

export const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(2, 'required').max(80, 'tooLong'),
    email: z.preprocess(emptyToNull, z.string().trim().email('invalidEmail').nullable()),
    notes: z.preprocess(emptyToNull, z.string().trim().max(2000, 'tooLong').nullable()), // private notes
  })
  .partial();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const NOTIFICATION_TYPES = [
  'owner_new_booking',
  'owner_cancelled',
  'owner_changed',
  'owner_payment',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** In-app alert shown in the bell of the dashboard. */
export interface InAppNotification {
  id: string;
  type: NotificationType;
  createdAt: string;
  readAt: string | null;
  booking: { id: string; startsAt: string; customerName: string; serviceName: string };
}

// ---------------------------------------------------------------------------------------------
// AI assistant (phase 4)
// ---------------------------------------------------------------------------------------------
/** One turn of the chat. The browser can only send "user" and "assistant" turns (never system or tool). */
export const aiChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1, 'required').max(600, 'tooLong'),
});
export const aiChatSchema = z.object({
  businessSlug: z.string().min(1).max(60),
  messages: z.array(aiChatMessageSchema).min(1).max(30),
  locale: z.enum(LOCALES).optional(),
});
export type AiChatInput = z.infer<typeof aiChatSchema>;

/** The customer picks a suggested slot: the server prepares a draft without calling the model. */
export const aiDraftSchema = z.object({
  businessSlug: z.string().min(1).max(60),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().nullable().optional(),
  startsAt: isoDateTime,
});
export type AiDraftInput = z.infer<typeof aiDraftSchema>;

/** The customer clicks "Confirm" on a draft: only a draft signed by the server can become a booking. */
export const aiConfirmSchema = z.object({
  draftToken: z.string().min(20).max(1000),
  customer: bookingCustomerSchema,
  notes: z.preprocess(emptyToNull, z.string().trim().max(500, 'tooLong').nullable().optional()),
  locale: z.enum(LOCALES).optional(),
});
export type AiConfirmInput = z.infer<typeof aiConfirmSchema>;

/** A booking proposal. It is NOT a booking: nothing is reserved until the customer confirms. */
export interface AiDraft {
  draftToken: string;
  expiresAt: string;
  service: { id: string; name: string; durationMin: number; price: number };
  staff: { id: string | null; displayName: string | null }; // null = any employee
  startsAt: string;
  endsAt: string;
  timezone: string;
}

/** Free slots found by the assistant, shown as clickable cards. */
export interface AiSlotsSuggestion {
  serviceId: string;
  staffId: string | null;
  serviceName: string;
  timezone: string;
  slots: { start: string; end: string; staffName: string | null }[];
}

/** Server-Sent Events of POST /public/ai/chat. */
export type AiStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'slots'; data: AiSlotsSuggestion }
  | { type: 'draft'; data: AiDraft }
  | { type: 'error'; code: string }
  | { type: 'done' };

// Owner writing and analysis tools (AI-03, AI-04, AI-05). The owner always reads the text before using it.
export const AI_MESSAGE_KINDS = ['reminder', 'cancellation', 'thanks', 'promotion'] as const;
export const AI_CONTENT_KINDS = ['business_description', 'service_description'] as const;
export const AI_TONES = ['friendly', 'formal', 'playful', 'professional'] as const;

export const aiGenerateSchema = z.object({
  kind: z.enum([...AI_MESSAGE_KINDS, ...AI_CONTENT_KINDS]),
  locale: z.enum(LOCALES), // language of the generated text (the customer's language)
  tone: z.enum(AI_TONES).default('friendly'),
  /** AI-05: 3 words or a short idea. AI-03 promotion: the offer. Treated as data, never as instructions. */
  keywords: z.preprocess(
    emptyToNull,
    z.string().trim().min(3, 'required').max(300, 'tooLong').nullable().optional(),
  ),
  serviceId: z.string().uuid().optional(), // for service_description
});
export type AiGenerateInput = z.infer<typeof aiGenerateSchema>;
export interface AiGenerateResult {
  text: string;
  model: string;
}

export const aiAnalyzeSchema = z.object({ locale: z.enum(LOCALES).default('fr') });
export type AiAnalyzeInput = z.infer<typeof aiAnalyzeSchema>;

export const reviewAnalysisSchema = z.object({
  summary: z.string().max(1500),
  sentiment_counts: z.object({
    positive: z.number().int().min(0),
    neutral: z.number().int().min(0),
    negative: z.number().int().min(0),
  }),
  themes: z
    .array(
      z.object({
        name: z.string().max(60),
        sentiment: z.enum(['positive', 'neutral', 'negative']),
        mentions: z.number().int().min(0),
      }),
    )
    .max(10),
});
export type ReviewAnalysis = z.infer<typeof reviewAnalysisSchema>;
export type ReviewAnalysisResult = ReviewAnalysis & { reviewCount: number };

// ---------------------------------------------------------------------------------------------
// Admin area (phase 5, FR-90). Only the ADMIN role.
// ---------------------------------------------------------------------------------------------
export const PLANS = ['FREE', 'PRO', 'BUSINESS'] as const;

export const adminListBusinessesSchema = z.object({
  q: z.string().trim().max(80).optional(), // name, slug or owner email
  plan: z.enum(PLANS).optional(),
  suspended: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminListBusinessesQuery = z.infer<typeof adminListBusinessesSchema>;

export const adminSuspendSchema = z.object({ suspended: z.boolean() });
export type AdminSuspendInput = z.infer<typeof adminSuspendSchema>;

export const adminPlanSchema = z.object({ plan: z.enum(PLANS) });
export type AdminPlanInput = z.infer<typeof adminPlanSchema>;

export const adminMonthSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'dateInvalid')
    .optional(), // YYYY-MM (UTC), default: this month
});
export type AdminMonthQuery = z.infer<typeof adminMonthSchema>;

export interface AdminBusiness {
  id: string;
  name: string;
  slug: string;
  plan: 'FREE' | 'PRO' | 'BUSINESS';
  suspendedAt: string | null;
  createdAt: string;
  ownerEmail: string | null;
  staffCount: number;
  bookingsThisMonth: number;
  aiCallsThisMonth: number;
}

export interface AdminStats {
  businesses: { total: number; active: number; suspended: number; byPlan: Record<string, number> };
  users: number;
  bookings: { total: number; thisMonth: number };
  ai: {
    month: string;
    calls: number;
    tokensIn: number;
    tokensOut: number;
    estimatedCostUsd: number;
  };
}

export interface AdminAiUsage {
  businessId: string;
  name: string;
  slug: string;
  calls: number;
  errors: number;
  tokensIn: number;
  tokensOut: number;
  /** An estimate from the public Groq price list (see apps/api/src/admin/ai-pricing.ts). */
  estimatedCostUsd: number;
}

// ---------------------------------------------------------------------------------------------
// Dead-letter list of emails that failed for good (phase 6, reliability). ADMIN only.
// ---------------------------------------------------------------------------------------------
export interface FailedNotification {
  id: string;
  type: string;
  channel: string;
  error: string | null;
  createdAt: string;
  business: { id: string; name: string };
  booking: { id: string; startsAt: string; status: string };
}
