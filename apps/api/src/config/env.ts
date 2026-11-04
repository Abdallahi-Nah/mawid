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
  RESEND_API_KEY: optionalStr,
  MAIL_FROM: z.string().min(1),
  UPLOAD_DIR: z.string().default('uploads'),
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
