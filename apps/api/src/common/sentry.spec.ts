import type { ErrorEvent } from '@sentry/node';
import { initSentry, scrubEvent } from './sentry';

describe('Sentry setup', () => {
  it('does nothing without a DSN', () => {
    expect(initSentry({ SENTRY_DSN: '', NODE_ENV: 'production', SENTRY_RELEASE: '' })).toBe(false);
  });

  it('removes cookies, bodies, secrets and personal data from an event', () => {
    const event = {
      type: undefined,
      request: {
        url: 'https://api.test/auth/login',
        cookies: { mawid_at: 'secret' },
        data: { email: 'a@b.co', password: 'Password123' },
        query_string: 'q=fatima',
        headers: {
          cookie: 'mawid_at=secret',
          authorization: 'Bearer x',
          accept: 'json',
          'x-api-key': 'k',
        },
      },
      user: { id: 'u1', email: 'a@b.co', ip_address: '1.2.3.4' },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event);
    expect(out.request?.cookies).toBeUndefined();
    expect(out.request?.data).toBeUndefined();
    expect(out.request?.query_string).toBe('[redacted]');
    expect(out.request?.headers).toEqual({
      cookie: '[redacted]',
      authorization: '[redacted]',
      accept: 'json',
      'x-api-key': '[redacted]',
    });
    expect(out.user).toEqual({ id: 'u1' });
    expect(JSON.stringify(out)).not.toMatch(/Password123|secret|a@b\.co|1\.2\.3\.4/);
  });
});
