import { loadEnv } from './env';

const valid = {
  DATABASE_URL: 'postgresql://x',
  REDIS_URL: 'redis://x',
  JWT_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  APP_URL: 'http://localhost:3000',
  API_URL: 'http://localhost:4000',
  MAIL_FROM: 'Mawid <a@b.c>',
};

describe('loadEnv', () => {
  it('accepts a valid environment', () => {
    expect(loadEnv(valid).PORT).toBe(4000);
  });
  it('fails fast with a clear message', () => {
    expect(() => loadEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });
});
