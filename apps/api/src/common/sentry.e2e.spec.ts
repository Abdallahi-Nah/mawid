import * as Sentry from '@sentry/node';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { captureServerError, initSentry } from './sentry';

/** A fake Sentry server on localhost: proves an error really leaves the API when a DSN is set. */
describe('Sentry (against a fake server)', () => {
  const received: string[] = [];
  let server: Server;
  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        received.push(`${req.url} ${Buffer.concat(chunks).toString('utf8')}`);
        res.statusCode = 200;
        res.end('{}');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  });
  afterAll(async () => {
    await Sentry.close(1000);
    await new Promise((r) => server.close(r));
  });

  it('sends a captured server error, with the environment, and no cookie or password', async () => {
    const port = (server.address() as AddressInfo).port;
    expect(
      initSentry({
        SENTRY_DSN: `http://publickey@127.0.0.1:${port}/1`,
        NODE_ENV: 'production',
        SENTRY_RELEASE: 'v1.0.0',
      }),
    ).toBe(true);
    Sentry.withScope((scope) => {
      scope.setUser({ id: 'u1', email: 'fatima@example.com' });
      scope.setContext('request', { cookie: 'mawid_at=secret', password: 'Password123' });
      captureServerError(new Error('boom from the API'));
    });
    await Sentry.flush(3000);
    const body = received.join('\n');
    expect(body).toContain('/api/1/envelope/');
    expect(body).toContain('boom from the API');
    expect(body).toContain('"environment":"production"');
    expect(body).toContain('v1.0.0');
    expect(body).not.toContain('fatima@example.com'); // personal data
    expect(body).not.toContain('Password123');
    expect(body).not.toContain('mawid_at=secret');
    expect(body).toContain('[redacted]'); // the context keys were scrubbed, not dropped
  });
});
