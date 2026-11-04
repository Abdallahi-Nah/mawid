import { z } from 'zod';

// Public values only. Secrets (GROQ_API_KEY, JWT_*) must never be read in the web app.
const schema = z.object({
  APP_URL: z.string().url(),
  API_URL: z.string().url(),
});

const result = schema.safeParse({ APP_URL: process.env.APP_URL, API_URL: process.env.API_URL });
if (!result.success) {
  const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  throw new Error(`Invalid environment variables (web):\n${lines.join('\n')}`);
}
export const env = result.data;
