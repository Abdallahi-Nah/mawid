import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { RequestHandler } from 'express';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { csrfGuard } from './common/csrf';
import type { Env } from './config/env';

/**
 * Security headers. The API only answers JSON, so its Content-Security-Policy forbids everything
 * (default-src 'none', no framing). The Swagger page (/docs) needs scripts and styles and gets a normal policy.
 * Uploaded images are shown by the web app on another origin, hence cross-origin resource policy.
 */
export function securityHeaders(env: Env): RequestHandler[] {
  const common = {
    crossOriginResourcePolicy: { policy: 'cross-origin' as const },
    referrerPolicy: { policy: 'no-referrer' as const },
    hsts: env.NODE_ENV === 'production' ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  };
  const strict = helmet({
    ...common,
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"] },
    },
  });
  const docs = helmet({ ...common, contentSecurityPolicy: false });
  return [(req, res, next) => (req.path.startsWith('/docs') ? docs : strict)(req, res, next)];
}

/** Everything that protects the API, shared by the real server and the integration tests. */
export function configureApp(app: INestApplication, env: Env): void {
  // The real client IP comes from X-Forwarded-For, but only from the proxies we trust.
  if (env.TRUST_PROXY > 0) app.getHttpAdapter().getInstance().set('trust proxy', env.TRUST_PROXY);
  for (const h of securityHeaders(env)) app.use(h);
  app.enableCors({ origin: env.APP_URL, credentials: true });
  app.use(cookieParser());
  app.use(csrfGuard([env.APP_URL, env.API_URL]));
  app.useGlobalFilters(new AllExceptionsFilter());
}

/** The OpenAPI description of the API: served at /docs in development and exported to docs/openapi.json. */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Mawid API')
      .setDescription(
        'Multi-tenant booking API. Authentication uses httpOnly cookies (mawid_at, mawid_rt); public routes are under /public.',
      )
      .setVersion('1.0.0')
      .addCookieAuth('mawid_at')
      .build(),
  );
}
