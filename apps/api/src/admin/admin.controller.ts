import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  adminListBusinessesSchema,
  adminMonthSchema,
  adminPlanSchema,
  paginationSchema,
  adminSuspendSchema,
  type AdminAiUsage,
  type AdminBusiness,
  type AdminListBusinessesQuery,
  type AdminMonthQuery,
  type AdminPlanInput,
  type AdminStats,
  type AdminSuspendInput,
  type FailedNotification,
  type Pagination,
  type Page,
} from '@mawid/shared';
import { z } from 'zod';
import { Roles } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { AdminService } from './admin.service';
import { DeadLetterService } from './dead-letter.service';

const idPipe = new ZodPipe(z.string().uuid());

@ApiTags('admin')
@ApiCookieAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly deadLetter: DeadLetterService,
  ) {}

  @Get('businesses')
  @ApiOperation({ summary: 'All businesses (search, plan, suspended)' })
  list(
    @Query(new ZodPipe(adminListBusinessesSchema)) q: AdminListBusinessesQuery,
  ): Promise<Page<AdminBusiness>> {
    return this.admin.listBusinesses(q);
  }

  @Patch('businesses/:id/suspension')
  @ApiOperation({ summary: 'Suspend or reactivate a business' })
  suspend(
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(adminSuspendSchema)) dto: AdminSuspendInput,
  ): Promise<AdminBusiness> {
    return this.admin.setSuspended(id, dto.suspended);
  }

  @Patch('businesses/:id/plan')
  @ApiOperation({ summary: 'Change the plan of a business (FREE, PRO, BUSINESS)' })
  plan(
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(adminPlanSchema)) dto: AdminPlanInput,
  ): Promise<AdminBusiness> {
    return this.admin.setPlan(id, dto.plan);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Global statistics' })
  stats(): Promise<AdminStats> {
    return this.admin.stats();
  }

  @Get('failed-notifications')
  @ApiOperation({ summary: 'Dead-letter list: emails that failed after all their retries' })
  failed(@Query(new ZodPipe(paginationSchema)) p: Pagination): Promise<Page<FailedNotification>> {
    return this.deadLetter.list(p);
  }

  @Post('failed-notifications/:id/retry')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a failed email again (3 new attempts)' })
  retry(@Param('id', idPipe) id: string) {
    return this.deadLetter.retry(id);
  }

  @Get('ai-usage')
  @ApiOperation({ summary: 'AI calls, tokens and estimated cost per business (?month=YYYY-MM)' })
  aiUsage(@Query(new ZodPipe(adminMonthSchema)) q: AdminMonthQuery): Promise<AdminAiUsage[]> {
    return this.admin.aiUsage(q.month);
  }
}
