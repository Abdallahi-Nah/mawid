import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  listCustomersSchema,
  updateCustomerSchema,
  type ListCustomersQuery,
  type UpdateCustomerInput,
} from '@mawid/shared';
import { CurrentTenant, Roles } from '../common/auth.decorators';
import { idPipe } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { CustomersService } from './customers.service';

@ApiTags('customers')
@ApiCookieAuth()
@Roles('OWNER')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'My customers (search with q: name, phone or email; paginated)' })
  list(
    @CurrentTenant() businessId: string,
    @Query(new ZodPipe(listCustomersSchema)) q: ListCustomersQuery,
  ) {
    return this.customers.list(businessId, q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Customer file: history, visits, no-shows and private notes' })
  get(@CurrentTenant() businessId: string, @Param('id', idPipe) id: string) {
    return this.customers.get(businessId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit name, email or the private notes' })
  @ApiBody({ schema: { type: 'object', example: { notes: 'Prefers the morning.' } } })
  update(
    @CurrentTenant() businessId: string,
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(updateCustomerSchema)) dto: UpdateCustomerInput,
  ) {
    return this.customers.update(businessId, id, dto);
  }
}
