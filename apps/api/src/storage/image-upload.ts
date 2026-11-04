import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Multipart field "file", one image of 2 MB at most. The real type is checked in StorageService. */
export const ImageInterceptor = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
});

export const imageBody = {
  schema: {
    type: 'object' as const,
    required: ['file'],
    properties: { file: { type: 'string' as const, format: 'binary' } },
  },
};
