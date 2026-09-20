'use server';

import { requireProtectedRole } from '@/features/auth/lib';
import { api } from '@/lib/api';
import type { Truck } from '@/lib/api-contract';

export async function getTrucks(): Promise<Truck[]> {
  await requireProtectedRole();

  return await api.admin.getTrucks();
}
