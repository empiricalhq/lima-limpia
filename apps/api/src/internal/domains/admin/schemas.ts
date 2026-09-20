import { z } from 'zod';
import { CommonSchemas } from '@/internal/shared/utils/validation';

export const CreateDriverSchema = z.object({
  name: CommonSchemas.name.min(2),
  email: z.email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
});

export const CreateUserSchema = CreateDriverSchema.extend({
  role: z.enum(['admin', 'supervisor', 'driver']),
});
