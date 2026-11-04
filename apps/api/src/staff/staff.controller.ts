import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  paginationSchema,
  staffInputSchema,
  staffUpdateSchema,
  workingHoursSchema,
  type Pagination,
  type StaffInput,
  type StaffUpdateInput,
  type WorkingHoursRow,
} from '@mawid/shared';
import { CurrentTenant, Roles } from '../common/auth.decorators';
import { idPipe } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { ImageInterceptor, imageBody } from '../storage/image-upload';
import { StaffService } from './staff.service';

@ApiTags('staff')
@ApiCookieAuth()
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Roles('OWNER', 'STAFF')
  @Get()
  @ApiOperation({ summary: 'List my employees with the ids of their services (paginated)' })
  list(@CurrentTenant() businessId: string, @Query(new ZodPipe(paginationSchema)) p: Pagination) {
    return this.staff.list(businessId, p);
  }

  @Roles('OWNER', 'STAFF')
  @Get(':id')
  @ApiOperation({ summary: 'One employee' })
  get(@CurrentTenant() businessId: string, @Param('id', idPipe) id: string) {
    return this.staff.get(businessId, id);
  }

  @Roles('OWNER')
  @Post()
  @ApiOperation({ summary: 'Create an employee and choose the services they perform' })
  @ApiBody({
    schema: {
      type: 'object',
      example: { displayName: 'Sidi Mohamed', active: true, serviceIds: ['<service uuid>'] },
    },
  })
  create(
    @CurrentTenant() businessId: string,
    @Body(new ZodPipe(staffInputSchema)) dto: StaffInput,
  ) {
    return this.staff.create(businessId, dto);
  }

  @Roles('OWNER')
  @Patch(':id')
  @ApiOperation({ summary: 'Update an employee (serviceIds replaces the list)' })
  @ApiBody({ schema: { type: 'object', example: { displayName: 'Sidi M.', serviceIds: [] } } })
  update(
    @CurrentTenant() businessId: string,
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(staffUpdateSchema)) dto: StaffUpdateInput,
  ) {
    return this.staff.update(businessId, id, dto);
  }

  @Roles('OWNER')
  @HttpCode(204)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete an employee (409 if they have bookings)' })
  remove(@CurrentTenant() businessId: string, @Param('id', idPipe) id: string) {
    return this.staff.remove(businessId, id);
  }

  @Roles('OWNER')
  @Post(':id/photo')
  @ApiOperation({ summary: 'Upload the photo (PNG, JPEG or WebP, 2 MB max)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(imageBody)
  @UseInterceptors(ImageInterceptor)
  photo(
    @CurrentTenant() businessId: string,
    @Param('id', idPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.staff.setPhoto(businessId, id, file);
  }

  @Roles('OWNER', 'STAFF')
  @Get(':id/working-hours')
  @ApiOperation({ summary: 'Weekly schedule of an employee (weekday 0 = Sunday)' })
  hours(@CurrentTenant() businessId: string, @Param('id', idPipe) id: string) {
    return this.staff.getWorkingHours(businessId, id);
  }

  @Roles('OWNER')
  @Put(':id/working-hours')
  @ApiOperation({ summary: 'Replace the weekly schedule (days, ranges and breaks)' })
  @ApiBody({
    schema: {
      type: 'array',
      example: [
        {
          weekday: 1,
          startTime: '09:00',
          endTime: '18:00',
          breakStart: '13:00',
          breakEnd: '14:00',
        },
      ],
    },
  })
  setHours(
    @CurrentTenant() businessId: string,
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(workingHoursSchema)) rows: WorkingHoursRow[],
  ) {
    return this.staff.setWorkingHours(businessId, id, rows);
  }
}
