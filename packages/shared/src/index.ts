import { z } from 'zod';

export const errorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
