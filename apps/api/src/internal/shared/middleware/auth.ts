import { createMiddleware } from 'hono/factory';
import type { AuthService } from '@/internal/domains/auth/service';
import type { AuthEnv } from '@/internal/domains/auth/types';
import { type AppRole, appPluginRoles, type PermissionRequest } from '@/internal/shared/auth/roles';
import { forbidden, unauthorized } from '@/internal/shared/utils/response';

interface OrganizationRolesResolution {
  ok: boolean;
  message?: string;
  roles?: AppRole[];
}

/** Resolve the caller's roles within their active organization. */
async function resolveActiveOrganizationRoles(
  authService: AuthService,
  headers: Headers,
  activeOrganizationId: string | null | undefined,
): Promise<OrganizationRolesResolution> {
  if (!activeOrganizationId) {
    return { ok: false, message: 'No active organization' };
  }

  const memberRoleResponse = await authService.api.getActiveMemberRole({ headers });

  if (!memberRoleResponse) {
    return { ok: false, message: 'No organization membership found' };
  }

  // Better Auth may return one role or a list of roles.
  const roles = (
    Array.isArray(memberRoleResponse.role) ? memberRoleResponse.role : [memberRoleResponse.role]
  ) as AppRole[];

  return { ok: true, roles };
}

/** Require a session and, when roles are provided, an active organization member role. */
export function createAuthMiddleware(authService: AuthService) {
  return function authMiddleware(allowedRoles: AppRole[]) {
    return createMiddleware<AuthEnv>(async (c, next) => {
      const session = await authService.api.getSession({
        headers: c.req.raw.headers,
      });

      if (!session?.user) {
        return unauthorized(c);
      }

      // An empty role list means any authenticated user may continue.
      if (allowedRoles.length === 0) {
        c.set('user', session.user);
        c.set('session', session.session);
        return await next();
      }

      const { user, session: sessionData } = session;
      const resolution = await resolveActiveOrganizationRoles(
        authService,
        c.req.raw.headers,
        sessionData.activeOrganizationId,
      );

      if (!(resolution.ok && resolution.roles?.some((role) => allowedRoles.includes(role)))) {
        return forbidden(c, resolution.message);
      }

      c.set('user', user);
      c.set('session', sessionData);
      await next();
    });
  };
}

/**
 * Require a session and a specific resource/action permission, per the roles' access-control
 * statements in roles.ts. Use this instead of `createAuthMiddleware`'s role list when a handler
 * is shared by roles that should not all have the same access to it (e.g. admin vs. supervisor).
 */
export function createPermissionMiddleware(authService: AuthService) {
  return function requirePermission(permission: PermissionRequest) {
    return createMiddleware<AuthEnv>(async (c, next) => {
      const session = await authService.api.getSession({
        headers: c.req.raw.headers,
      });

      if (!session?.user) {
        return unauthorized(c);
      }

      const { user, session: sessionData } = session;
      const resolution = await resolveActiveOrganizationRoles(
        authService,
        c.req.raw.headers,
        sessionData.activeOrganizationId,
      );

      const authorized = resolution.roles?.some((role) => appPluginRoles[role].authorize(permission).success);

      if (!authorized) {
        return forbidden(c, resolution.message ?? 'Insufficient permissions');
      }

      c.set('user', user);
      c.set('session', sessionData);
      await next();
    });
  };
}

/** Allow authenticated users who do not have an active organization. */
export function createCitizenOnlyMiddleware(authService: AuthService) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const session = await authService.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.user) {
      return unauthorized(c);
    }

    if (session.session.activeOrganizationId) {
      return forbidden(c, 'This endpoint is for citizens only.');
    }

    c.set('user', session.user);
    c.set('session', session.session);
    await next();
  });
}
