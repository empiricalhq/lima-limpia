'use server';

import { revalidatePath } from 'next/cache';
import { requireProtectedRole } from '@/features/auth/lib';
import { api } from '@/lib/api';
import type { Route } from '@/lib/api-contract';
import { type CreateRouteSchema, createRouteSchema } from './schemas';

interface ActionResult {
  error?: string;
}
export async function getRoutes(): Promise<Route[]> {
  await requireProtectedRole();

  return await api.admin.getRoutes();
}

export async function createRoute(data: CreateRouteSchema): Promise<ActionResult> {
  const validatedFields = createRouteSchema.safeParse(data);
  if (!validatedFields.success) {
    return { error: 'Invalid fields.' };
  }

  try {
    await requireProtectedRole();

    await api.admin.createRoute(validatedFields.data);
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Failed to create route.' };
  }

  revalidatePath('/routes');
  return { error: undefined };
}
