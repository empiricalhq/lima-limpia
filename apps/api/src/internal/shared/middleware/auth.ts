import { type AppRole, appPluginRoles, type PermissionRequest, toRoleList } from '@lima-garbage/database';
import { createMiddleware } from 'hono/factory';
import type { AuthService } from '@/internal/domains/auth/service';
import type { AuthEnv, StaffEnv } from '@/internal/domains/auth/types';
import { organizationScope } from '@/internal/shared/tenancy/scope';
import { forbidden, unauthorized } from '@/internal/shared/utils/response';

type OrganizationRolesResolution =
  | { ok: true; organizationId: string; roles: AppRole[] }
  | { ok: false; message: string };

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

  return { ok: true, organizationId: activeOrganizationId, roles: toRoleList(memberRoleResponse.role) };
}

/**
 * Require a session and an active organization member role. The active organization becomes the
 * request's `scope`: every repository call for staff data runs under it.
 */
export function createAuthMiddleware(authService: AuthService) {
  return function authMiddleware(allowedRoles: AppRole[]) {
    return createMiddleware<StaffEnv>(async (c, next) => {
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

      if (!(resolution.ok && resolution.roles.some((role) => allowedRoles.includes(role)))) {
        return forbidden(c, resolution.ok ? undefined : resolution.message);
      }

      c.set('user', user);
      c.set('session', sessionData);
      c.set('scope', organizationScope(resolution.organizationId));
      await next();
    });
  };
}

/**
 * Require a session and a specific resource/action permission, per the roles' access-control
 * statements in roles.ts. Use this instead of `createAuthMiddleware`'s role list when a handler
 * is shared by roles that should not all have the same access to it (e.g. admin vs. supervisor).
 * Like `createAuthMiddleware`, it sets the request's `scope`.
 */
export function createPermissionMiddleware(authService: AuthService) {
  return function requirePermission(permission: PermissionRequest) {
    return createMiddleware<StaffEnv>(async (c, next) => {
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

      if (!resolution.ok) {
        return forbidden(c, resolution.message);
      }
      if (!resolution.roles.some((role) => appPluginRoles[role].authorize(permission).success)) {
        return forbidden(c, 'Insufficient permissions');
      }

      c.set('user', user);
      c.set('session', sessionData);
      c.set('scope', organizationScope(resolution.organizationId));
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
