import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { loadEnv } from './config/env';
import { LocalStorageService } from './storage/local-storage.service';

async function bootstrap(): Promise<void> {
  const env = loadEnv(); // fails fast with a clear message
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(
    helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }),
  );
  app.enableCors({ origin: env.APP_URL, credentials: true });
  app.use(cookieParser());
  app.useStaticAssets(app.get(LocalStorageService).root, {
    prefix: '/uploads/',
    index: false,
    dotfiles: 'deny',
  });
  app.useGlobalFilters(new AllExceptionsFilter());

  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Mawid API')
      .setVersion('0.1.0')
      .addCookieAuth('mawid_at')
      .build(),
  );
  SwaggerModule.setup('docs', app, doc);

  await app.listen(env.PORT);
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
