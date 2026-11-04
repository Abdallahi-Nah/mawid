import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@mawid/shared';
import { Public } from '../common/auth.decorators';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): HealthResponse {
    return { status: 'ok', time: new Date().toISOString() };
  }
}
