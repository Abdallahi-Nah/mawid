import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  paginationSchema,
  timeOffInputSchema,
  timeOffUpdateSchema,
  type Pagination,
  type TimeOffInput,
  type TimeOffUpdateInput,
} from '@mawid/shared';
import { CurrentTenant, Roles } from '../common/auth.decorators';
import { idPipe } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { TimeOffService } from './time-off.service';

const listQuery = paginationSchema.extend({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

@ApiTags('time-off')
@ApiCookieAuth()
@Controller('time-off')
export class TimeOffController {
  constructor(private readonly timeOff: TimeOffService) {}

  @Roles('OWNER', 'STAFF')
  @Get()
  @ApiOperation({ summary: 'Days off and closing days (paginated, optional from/to filter)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  list(
    @CurrentTenant() businessId: string,
    @Query(new ZodPipe(listQuery)) q: Pagination & { from?: string; to?: string },
  ) {
    return this.timeOff.list(businessId, q, q);
  }

  @Roles('OWNER')
  @Post()
  @ApiOperation({ summary: 'Add a day off. Without staffId the whole business is closed' })
  @ApiBody({
    schema: {
      type: 'object',
      example: {
        staffId: null,
        startsAt: '2026-12-25T00:00:00Z',
        endsAt: '2026-12-26T00:00:00Z',
        reason: 'Holiday',
      },
    },
  })
  create(
    @CurrentTenant() businessId: string,
    @Body(new ZodPipe(timeOffInputSchema)) dto: TimeOffInput,
  ) {
    return this.timeOff.create(businessId, dto);
  }

  @Roles('OWNER')
  @Patch(':id')
  @ApiOperation({ summary: 'Update a day off' })
  @ApiBody({ schema: { type: 'object', example: { reason: 'Updated' } } })
  update(
    @CurrentTenant() businessId: string,
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(timeOffUpdateSchema)) dto: TimeOffUpdateInput,
  ) {
    return this.timeOff.update(businessId, id, dto);
  }

  @Roles('OWNER')
  @HttpCode(204)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a day off' })
  remove(@CurrentTenant() businessId: string, @Param('id', idPipe) id: string) {
    return this.timeOff.remove(businessId, id);
  }
}
