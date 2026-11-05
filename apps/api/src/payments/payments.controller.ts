import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  listPaymentsSchema,
  submitPaymentSchema,
  type ListPaymentsQuery,
  type OwnerPayment,
  type Page,
  type PublicBookingView,
  type SubmitPaymentInput,
} from '@mawid/shared';
import { z } from 'zod';
import { CurrentTenant, Public, Roles } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { ImageInterceptor } from '../storage/image-upload';
import { PaymentsService } from './payments.service';

const idPipe = new ZodPipe(z.string().uuid());

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('public/bookings/:token/payment')
  @ApiOperation({
    summary:
      'Send the proof of the deposit: a reference and/or a screenshot (PNG, JPEG, WebP, 2 MB)',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { reference: { type: 'string' }, file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(ImageInterceptor)
  submit(
    @Param('token', idPipe) token: string,
    @Body(new ZodPipe(submitPaymentSchema)) dto: SubmitPaymentInput,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<PublicBookingView> {
    return this.payments.submit(token, dto, file);
  }

  @ApiCookieAuth()
  @Roles('OWNER')
  @Get('payments')
  @ApiOperation({ summary: 'Deposits to check (filter with ?status=PENDING)' })
  list(
    @CurrentTenant() businessId: string,
    @Query(new ZodPipe(listPaymentsSchema)) q: ListPaymentsQuery,
  ): Promise<Page<OwnerPayment>> {
    return this.payments.list(businessId, q);
  }

  @ApiCookieAuth()
  @Roles('OWNER')
  @HttpCode(200)
  @Post('payments/:id/validate')
  @ApiOperation({ summary: 'The deposit is received: the booking becomes CONFIRMED' })
  validate(@CurrentTenant() businessId: string, @Param('id', idPipe) id: string) {
    return this.payments.validate(businessId, id);
  }

  @ApiCookieAuth()
  @Roles('OWNER')
  @HttpCode(200)
  @Post('payments/:id/reject')
  @ApiOperation({ summary: 'The proof is not good: the booking stays PENDING' })
  reject(@CurrentTenant() businessId: string, @Param('id', idPipe) id: string) {
    return this.payments.reject(businessId, id);
  }
}
