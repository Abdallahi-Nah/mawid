import { Body, Controller, Get, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { updateBusinessSchema, type UpdateBusinessInput } from '@mawid/shared';
import { CurrentTenant, Roles } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { ImageInterceptor, imageBody } from '../storage/image-upload';
import { BusinessesService } from './businesses.service';

@ApiTags('businesses')
@ApiCookieAuth()
@Controller('businesses/me')
export class BusinessesController {
  constructor(private readonly businesses: BusinessesService) {}

  @Roles('OWNER', 'STAFF')
  @Get()
  @ApiOperation({ summary: 'Profile of my business' })
  get(@CurrentTenant() businessId: string) {
    return this.businesses.get(businessId);
  }

  @Roles('OWNER')
  @Patch()
  @ApiOperation({
    summary: 'Update my business (name, slug, address, hours settings, language, color...)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      example: {
        name: 'Salon Nour',
        slug: 'salon-nour',
        phone: '+222 22 00 11 22',
        category: 'salon',
        defaultLocale: 'fr',
        brandColor: '#0f766e',
      },
    },
  })
  update(
    @CurrentTenant() businessId: string,
    @Body(new ZodPipe(updateBusinessSchema)) dto: UpdateBusinessInput,
  ) {
    return this.businesses.update(businessId, dto);
  }

  @Roles('OWNER')
  @Post('logo')
  @ApiOperation({ summary: 'Upload the logo (PNG, JPEG or WebP, 2 MB max)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(imageBody)
  @UseInterceptors(ImageInterceptor)
  logo(@CurrentTenant() businessId: string, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.businesses.setLogo(businessId, file);
  }
}
