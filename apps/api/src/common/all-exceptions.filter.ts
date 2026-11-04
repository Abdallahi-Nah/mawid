import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
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
      body = {
        code: HttpStatus[status] ?? 'ERROR',
        message: Array.isArray(msg) ? 'Validation failed' : String(msg ?? exception.message),
        ...(Array.isArray(msg) ? { details: msg } : {}),
      };
    }
    res.status(status).json(body);
  }
}
