import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import type { ErrorResponse } from '@mawid/shared';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
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
      };
      const hit = map[exception.code];
      if (hit) {
        status = hit[0];
        body = { code: hit[1], message: hit[2] };
      }
    }
    res.status(status).json(body);
  }
}
