import { z } from 'zod';
import { ZodPipe } from './zod.pipe';

/** For @Param('id', idPipe). */
export const idPipe = new ZodPipe(z.string().uuid());
