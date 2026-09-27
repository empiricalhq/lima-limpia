import { z } from 'zod';

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  createdAt: z.iso.datetime(),
  role: z.string().optional(),
});

export type User = z.infer<typeof userSchema>;

export const issueSchema = z.object({
  source: z.enum(['driver', 'citizen']),
  id: z.string(),
  type: z.string(),
  status: z.string(),
  created_at: z.iso.datetime(),
  description: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
});

export type Issue = z.infer<typeof issueSchema>;

export const sessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  token: z.string(),
  expiresAt: z.iso.datetime(),
  activeOrganizationId: z.string().nullable().optional(),
});

export type Session = z.infer<typeof sessionSchema>;

export const memberRoleSchema = z.object({
  role: z.union([z.string(), z.array(z.string())]),
});

export type MemberRole = z.infer<typeof memberRoleSchema>;
