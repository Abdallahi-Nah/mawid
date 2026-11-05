import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PlanInfo } from '@mawid/shared';
import { CurrentTenant, Roles } from '../common/auth.decorators';
import { PlansService } from './plans.service';

@ApiTags('plan')
@ApiCookieAuth()
@Controller('businesses/me/plan')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Roles('OWNER', 'STAFF')
  @Get()
  @ApiOperation({ summary: 'My plan, its limits and what I used this month' })
  get(@CurrentTenant() businessId: string): Promise<PlanInfo> {
    return this.plans.info(businessId);
  }
}
