import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  paginationSchema,
  serviceInputSchema,
  serviceUpdateSchema,
  type Pagination,
  type ServiceInput,
  type ServiceUpdateInput,
} from '@mawid/shared';
import { CurrentTenant, Roles } from '../common/auth.decorators';
import { idPipe } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { ServicesService } from './services.service';

const example = {
  name: 'Coupe de cheveux',
  durationMin: 45,
  price: 300,
  category: 'Cheveux',
  bufferMin: 0,
  active: true,
};

@ApiTags('services')
@ApiCookieAuth()
@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Roles('OWNER', 'STAFF')
  @Get()
  @ApiOperation({ summary: 'List my services (paginated: page, pageSize)' })
  list(@CurrentTenant() businessId: string, @Query(new ZodPipe(paginationSchema)) p: Pagination) {
    return this.services.list(businessId, p);
  }

  @Roles('OWNER', 'STAFF')
  @Get(':id')
  @ApiOperation({ summary: 'One service' })
  get(@CurrentTenant() businessId: string, @Param('id', idPipe) id: string) {
    return this.services.get(businessId, id);
  }

  @Roles('OWNER')
  @Post()
  @ApiOperation({ summary: 'Create a service' })
  @ApiBody({ schema: { type: 'object', example } })
  create(
    @CurrentTenant() businessId: string,
    @Body(new ZodPipe(serviceInputSchema)) dto: ServiceInput,
  ) {
    return this.services.create(businessId, dto);
  }

  @Roles('OWNER')
  @Patch(':id')
  @ApiOperation({ summary: 'Update a service' })
  @ApiBody({ schema: { type: 'object', example: { price: 350 } } })
  update(
    @CurrentTenant() businessId: string,
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(serviceUpdateSchema)) dto: ServiceUpdateInput,
  ) {
    return this.services.update(businessId, id, dto);
  }

  @Roles('OWNER')
  @HttpCode(204)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a service (409 if it has bookings)' })
  remove(@CurrentTenant() businessId: string, @Param('id', idPipe) id: string) {
    return this.services.remove(businessId, id);
  }
}
