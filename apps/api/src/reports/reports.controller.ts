import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  reportRangeSchema,
  type BookingsPerDayPoint,
  type PeakHour,
  type ReportRangeQuery,
  type ReportSummary,
  type TopService,
} from '@mawid/shared';
import type { Response } from 'express';
import { CurrentTenant, Roles } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { ReportsService } from './reports.service';

const range = new ZodPipe(reportRangeSchema);

@ApiTags('reports')
@ApiCookieAuth()
@Roles('OWNER')
@Controller('reports')
@ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD (default: 30 days ago)' })
@ApiQuery({ name: 'to', required: false, description: 'YYYY-MM-DD (default: today)' })
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Key figures: today, this week, revenue, cancellation and no-show rates',
  })
  summary(@CurrentTenant() id: string, @Query(range) q: ReportRangeQuery): Promise<ReportSummary> {
    return this.reports.summary(id, q);
  }

  @Get('bookings-per-day')
  @ApiOperation({ summary: 'Bookings and revenue per day' })
  perDay(
    @CurrentTenant() id: string,
    @Query(range) q: ReportRangeQuery,
  ): Promise<BookingsPerDayPoint[]> {
    return this.reports.bookingsPerDay(id, q);
  }

  @Get('top-services')
  @ApiOperation({ summary: 'The 5 most booked services' })
  top(@CurrentTenant() id: string, @Query(range) q: ReportRangeQuery): Promise<TopService[]> {
    return this.reports.topServices(id, q);
  }

  @Get('peak-hours')
  @ApiOperation({ summary: 'Bookings per hour of the day' })
  peak(@CurrentTenant() id: string, @Query(range) q: ReportRangeQuery): Promise<PeakHour[]> {
    return this.reports.peakHours(id, q);
  }

  @Get('bookings.csv')
  @ApiOperation({ summary: 'Export the bookings of the range as CSV' })
  async csv(
    @CurrentTenant() id: string,
    @Query(range) q: ReportRangeQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="bookings.csv"');
    return this.reports.bookingsCsv(id, q);
  }
}
