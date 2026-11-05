import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { loadEnv } from './config/env';
import { LocalStorageService } from './storage/local-storage.service';

async function bootstrap(): Promise<void> {
  const env = loadEnv(); // fails fast with a clear message
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app, env);
  app.useStaticAssets(app.get(LocalStorageService).root, {
    prefix: '/uploads/',
    index: false,
    dotfiles: 'deny',
  });

  // The API documentation page is for development; in production it must be switched on on purpose.
  if (env.NODE_ENV !== 'production' || env.API_DOCS) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Mawid API')
        .setVersion('0.1.0')
        .addCookieAuth('mawid_at')
        .build(),
    );
    SwaggerModule.setup('docs', app, doc);
  }

  await app.listen(env.PORT);
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
