'use server';

import { redirect } from 'next/navigation';
import { cache } from 'react';
import { hasAnyRole, PROTECTED_ROLES, type Role } from '@/features/auth/roles';
import { api } from '@/lib/api';
import type { Session, User } from '@/lib/api-contract';

export interface AuthContext {
  user: User & { role?: string };
  session: Session;
}

export const getAuth = cache(async (): Promise<AuthContext | null> => {
  try {
    const authContext = await api.auth.getSession();

    if (authContext && !authContext.session) {
      return null;
    }

    return authContext;
  } catch {
    return null;
  }
});

export const getCurrentUser = cache(async (): Promise<User | null> => (await getAuth())?.user ?? null);

export const getUserRoles = cache(async (): Promise<string[]> => (await getAuth())?.user?.role?.split(',') ?? []);

export const requireUser = cache(async (): Promise<User> => {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/signin');
  }

  return user;
});

/** Require a signed-in user with one of `allowedRoles`. Throws for use in server actions. */
export async function requireRole(allowedRoles: Role[]): Promise<User> {
  const user = await requireUser();
  const userRoles = await getUserRoles();

  if (!hasAnyRole(userRoles, allowedRoles)) {
    throw new Error('Unauthorized');
  }

  return user;
}

/** Require a signed-in user with one of the dashboard-wide protected roles. */
export function requireProtectedRole(): Promise<User> {
  return requireRole(PROTECTED_ROLES);
}
