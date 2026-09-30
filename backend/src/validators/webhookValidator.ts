import { z } from 'zod';

export const webhookVerificationQuerySchema = z.object({
  'hub.mode': z.string().optional(),
  'hub.verify_token': z.string().optional(),
  'hub.challenge': z.string().optional(),
});

export const webhookPayloadSchema = z.object({
  object: z.string().optional(),
  entry: z.array(z.record(z.unknown())).optional(),
});
