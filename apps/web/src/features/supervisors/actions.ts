'use server';

import { revalidatePath } from 'next/cache';
import { requireProtectedRole } from '@/features/auth/lib';
import { api } from '@/lib/api';
import type { User } from '@/lib/api-contract';
import {
  type CreateSupervisorSchema,
  createSupervisorSchema,
  type UpdateSupervisorSchema,
  updateSupervisorSchema,
} from './schemas';

interface ActionResult {
  error?: string;
}

export async function getSupervisors(): Promise<User[]> {
  await requireProtectedRole();
  return await api.admin.getSupervisors();
}

export async function createSupervisor(data: CreateSupervisorSchema): Promise<ActionResult> {
  const validatedFields = createSupervisorSchema.safeParse(data);
  if (!validatedFields.success) {
    return { error: 'Invalid fields.' };
  }

  try {
    await requireProtectedRole();
    const { name, email, password } = validatedFields.data;
    await api.admin.createSupervisor({ name, email, password });
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Failed to create supervisor.' };
  }

  revalidatePath('/supervisors');
  return { error: undefined };
}

export async function updateSupervisor(data: UpdateSupervisorSchema): Promise<ActionResult> {
  const validatedFields = updateSupervisorSchema.safeParse(data);
  if (!validatedFields.success) {
    return { error: 'Invalid fields.' };
  }

  try {
    await requireProtectedRole();
    const { id, name, email, password } = validatedFields.data;
    await api.admin.updateSupervisor(id, {
      name,
      email,
      ...(password && { password }),
    });
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Failed to update supervisor.' };
  }

  revalidatePath('/supervisors');
  return { error: undefined };
}
