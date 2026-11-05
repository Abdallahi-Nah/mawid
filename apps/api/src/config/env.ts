import { z } from 'zod';

const optionalStr = z.string().default('');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  GROQ_API_KEY: optionalStr,
  GROQ_MODEL_CHAT: optionalStr,
  GROQ_MODEL_FAST: optionalStr,
  GROQ_MODEL_STT: optionalStr,
  // Kill switch: AI_ENABLED=false turns every AI feature off (the normal booking flow is not affected).
  AI_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v.trim().toLowerCase() !== 'false'),
  AI_TIMEOUT_MS: z.coerce.number().default(15_000),
  // Calls to Groq allowed per month for a FREE business (PRO x10, BUSINESS x50).
  AI_MONTHLY_QUOTA: z.coerce.number().default(1000),
  RESEND_API_KEY: optionalStr,
  MAIL_FROM: z.string().min(1),
  UPLOAD_DIR: z.string().default('uploads'),
  // Notification queue. The prefix keeps several environments (and the tests) apart in one Redis.
  QUEUE_PREFIX: z.string().default('mawid'),
  NOTIFY_BACKOFF_MS: z.coerce.number().default(30_000),
});
export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment variables:\n${lines.join('\n')}`);
  }
  return result.data;
}
