import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { buildOpenApiDocument, configureApp } from './app.setup';
import { initSentry } from './common/sentry';
import { loadEnv } from './config/env';
import { LocalStorageService } from './storage/local-storage.service';

async function bootstrap(): Promise<void> {
  const env = loadEnv(); // fails fast with a clear message
  initSentry(env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // SIGTERM/SIGINT: stop taking requests, let running jobs finish, close Redis and the database.
  app.enableShutdownHooks();
  configureApp(app, env);
  app.useStaticAssets(app.get(LocalStorageService).root, {
    prefix: '/uploads/',
    index: false,
    dotfiles: 'deny',
  });

  // The API documentation page is for development; in production it must be switched on on purpose.
  if (env.NODE_ENV !== 'production' || env.API_DOCS) {
    const doc = buildOpenApiDocument(app);
    SwaggerModule.setup('docs', app, doc);
  }

  await app.listen(env.PORT);
}

process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled promise rejection:', reason);
});

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
