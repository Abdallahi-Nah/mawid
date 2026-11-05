// Writes the OpenAPI description of the API to a JSON file (default: docs/openapi.json at the repository root).
// (It runs the compiled code: Swagger needs the decorator metadata that tsx does not emit.)
// Usage: pnpm --filter api openapi [output-file]      Needs the database and Redis (the app is started to read its routes).
import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AppModule } from '../app.module';
import { buildOpenApiDocument } from '../app.setup';

async function main(): Promise<void> {
  const out = resolve(process.argv[2] ?? resolve(__dirname, '../../../../docs/openapi.json'));
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  const doc = buildOpenApiDocument(app);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
  console.log(`OpenAPI written to ${out}: ${Object.keys(doc.paths).length} paths`);
  await app.close();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
