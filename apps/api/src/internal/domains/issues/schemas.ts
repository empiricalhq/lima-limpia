import { z } from 'zod';
import { CommonSchemas } from '@/internal/shared/utils/validation';

const CitizenIssueTypeSchema = z.enum(['missed_collection', 'illegal_dumping', 'other']);

export const CreateCitizenIssueSchema = z.object({
  type: CitizenIssueTypeSchema,
  description: CommonSchemas.description,
  photo_url: z.url().optional(),
  ...CommonSchemas.location.shape,
});

export const CreateDriverIssueSchema = z.object({
  type: z.enum(['mechanical_failure', 'road_blocked', 'truck_full', 'other']),
  notes: CommonSchemas.description,
  ...CommonSchemas.location.shape,
});

// Admin-created issues are stored as citizen issue reports, so they share the same type enum.
export const CreateAdminIssueSchema = z.object({
  type: CitizenIssueTypeSchema,
  description: CommonSchemas.description,
  ...CommonSchemas.location.shape,
});

export type CreateCitizenIssueRequest = z.infer<typeof CreateCitizenIssueSchema>;
export type CreateDriverIssueRequest = z.infer<typeof CreateDriverIssueSchema>;
