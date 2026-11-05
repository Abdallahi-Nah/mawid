import type { IncomingMessage, ServerResponse } from 'node:http';
import { loggerParams } from './logging';

const opts = (env: NodeJS.ProcessEnv) =>
  loggerParams(env).pinoHttp as unknown as {
    level: string;
    transport?: unknown;
    genReqId: (req: IncomingMessage, res: ServerResponse) => string;
    customLogLevel: (req: unknown, res: { statusCode: number }, err?: Error) => string;
    serializers: {
      req: (r: { id: string; method: string; url?: string }) => Record<string, unknown>;
    };
    autoLogging: { ignore: (r: { url: string }) => boolean };
  };

describe('structured logging', () => {
  it('logs JSON in production and is quiet in tests', () => {
    expect(opts({ NODE_ENV: 'production' }).transport).toBeUndefined();
    expect(opts({ NODE_ENV: 'production' }).level).toBe('info');
    expect(opts({ NODE_ENV: 'test' }).level).toBe('silent');
    expect(opts({ NODE_ENV: 'production', LOG_LEVEL: 'warn' }).level).toBe('warn');
  });

  it('gives every request an id, reuses a valid x-request-id, refuses a weird one', () => {
    const header = jest.fn();
    const res = { setHeader: header } as unknown as ServerResponse;
    const o = opts({ NODE_ENV: 'production' });
    expect(
      o.genReqId(
        { headers: { 'x-request-id': 'abc-12345678' } } as unknown as IncomingMessage,
        res,
      ),
    ).toBe('abc-12345678');
    const made = o.genReqId(
      { headers: { 'x-request-id': 'bad id\nwith lines' } } as unknown as IncomingMessage,
      res,
    );
    expect(made).toMatch(/^[0-9a-f-]{36}$/);
    expect(header).toHaveBeenLastCalledWith('x-request-id', made);
  });

  it('logs the path without the query string, errors by severity, and skips health checks', () => {
    const o = opts({ NODE_ENV: 'production' });
    expect(
      o.serializers.req({ id: '1', method: 'GET', url: '/customers?q=fatima%40mail.com' }),
    ).toEqual({
      id: '1',
      method: 'GET',
      path: '/customers',
    });
    expect(o.customLogLevel({}, { statusCode: 200 })).toBe('info');
    expect(o.customLogLevel({}, { statusCode: 404 })).toBe('warn');
    expect(o.customLogLevel({}, { statusCode: 500 })).toBe('error');
    expect(o.autoLogging.ignore({ url: '/health/ready' })).toBe(true);
    expect(o.autoLogging.ignore({ url: '/services' })).toBe(false);
  });
});
