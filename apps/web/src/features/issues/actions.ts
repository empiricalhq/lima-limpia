'use server';

import { revalidatePath } from 'next/cache';
import { requireProtectedRole } from '@/features/auth/lib';
import { api } from '@/lib/api';
import { type CreateIssueSchema, createIssueSchema } from './schemas';

interface ActionResult {
  error?: string;
}

export async function createIssue(data: CreateIssueSchema): Promise<ActionResult> {
  const validatedFields = createIssueSchema.safeParse(data);
  if (!validatedFields.success) {
    return { error: 'Invalid fields.' };
  }

  try {
    await requireProtectedRole();
    await api.admin.createIssue(validatedFields.data);
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Failed to create issue.' };
  }

  revalidatePath('/dashboard');
  return { error: undefined };
}
