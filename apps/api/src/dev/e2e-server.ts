import 'reflect-metadata';
import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import { LlmClient } from '../ai/llm.client';
import { loadEnv } from '../config/env';
import { DemoLlm } from './demo-llm';

/**
 * API for browser tests WITHOUT a Groq key: the normal app, but the model is the scripted DemoLlm.
 * Run: node dist/dev/e2e-server.js   (same environment variables as the API). Never used in production.
 */
async function main(): Promise<void> {
  process.env.GROQ_API_KEY ||= 'demo-key-not-real';
  process.env.AI_ENABLED = 'true';
  const env = loadEnv();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(LlmClient)
    .useValue(new DemoLlm())
    .compile();
  const app = moduleRef.createNestApplication();
  // The same protections as the real server (headers, CORS, CSRF check, error filter).
  configureApp(app, env);
  await app.listen(env.PORT);
}
main().catch((e: unknown) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
