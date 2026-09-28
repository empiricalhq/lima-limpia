import { z } from 'zod';
import { CommonSchemas } from '@/internal/shared/utils/validation';

export const ImpersonateSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1).optional(),
});

export const CitizenSearchSchema = z.object({
  email: z.email('Invalid email format'),
});

export const RouteParamSchema = z.object({ id: CommonSchemas.id });
