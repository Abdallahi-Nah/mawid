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
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const onboardingBusinessSchema = z.object({
  name: z.string().trim().min(2, 'required'),
  category: z.enum(['salon', 'clinic', 'garage', 'restaurant'], { errorMap: () => ({ message: 'required' }) }),
  phone: z.string().trim().regex(/^\+?[0-9 ]{8,15}$/, 'invalidPhone'),
});
export type OnboardingBusinessInput = z.infer<typeof onboardingBusinessSchema>;
