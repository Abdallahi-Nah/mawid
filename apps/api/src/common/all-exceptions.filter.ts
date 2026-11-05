import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import type { ErrorResponse } from '@mawid/shared';
import { captureServerError } from './sentry';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorResponse = { code: 'INTERNAL_ERROR', message: 'Internal server error' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      const obj = typeof r === 'string' ? { message: r } : (r as Record<string, unknown>);
      const msg = obj.message;
      const details = Array.isArray(msg) ? msg : obj.details;
      body = {
        code: typeof obj.code === 'string' ? obj.code : (HttpStatus[status] ?? 'ERROR'),
        message: Array.isArray(msg) ? 'Validation failed' : String(msg ?? exception.message),
        ...(details !== undefined ? { details } : {}),
      };
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Safety net: a tenant-scoped update or delete of a row that is not ours ends here as a 404.
      const map: Record<string, [HttpStatus, string, string]> = {
        P2025: [HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not found'],
        P2002: [HttpStatus.CONFLICT, 'CONFLICT', 'This value already exists'],
        P2003: [HttpStatus.CONFLICT, 'IN_USE', 'This item is used elsewhere'],
        // No database connection became free in time: a short overload, the caller can simply try again.
        P2028: [
          HttpStatus.SERVICE_UNAVAILABLE,
          'BUSY',
          'The server is busy, try again in a moment',
        ],
      };
      const hit = map[exception.code];
      if (hit) {
        status = hit[0];
        body = { code: hit[1], message: hit[2] };
      }
    }
    // A 5xx is OUR bug: keep the stack in the logs and send it to Sentry. A 4xx is the caller's mistake.
    if (status >= 500) {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
      );
      captureServerError(exception);
    }
    res.status(status).json(body);
  }
}
