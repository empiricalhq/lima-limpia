'use server';

import { redirect } from 'next/navigation';
import { cache } from 'react';
import { hasAnyRole, PROTECTED_ROLES, type Role, toRoleList } from '@/features/auth/roles';
import { api } from '@/lib/api';
import type { Session, User } from '@/lib/api-contract';

export interface AuthContext {
  user: User;
  session: Session;
  /** The user's organization membership role(s), the source of truth for staff access. Empty for a citizen. */
  roles: string[];
}

/** A failed role lookup must fail the request, not masquerade as an unauthenticated user. */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  let session: Awaited<ReturnType<typeof api.auth.getSession>>;

  try {
    session = await api.auth.getSession();
  } catch {
    return null;
  }

  if (!session?.session) {
    return null;
  }

  const memberRole = await api.auth.getActiveMemberRole();

  return { user: session.user, session: session.session, roles: toRoleList(memberRole?.role) };
});

export const getCurrentUser = cache(async (): Promise<User | null> => (await getAuth())?.user ?? null);

export const getUserRoles = cache(async (): Promise<string[]> => (await getAuth())?.roles ?? []);

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
export async function requireProtectedRole(): Promise<User> {
  return await requireRole(PROTECTED_ROLES);
}
