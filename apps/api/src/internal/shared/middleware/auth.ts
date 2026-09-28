import {
  type AppRole,
  appPluginRoles,
  IMPERSONATION_SESSION_SECONDS,
  PlatformRoles,
  type PermissionRequest,
  toRoleList,
} from '@lima-garbage/database';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { matchedRoutes } from 'hono/route';
import type { AuthService } from '@/internal/domains/auth/service';
import type { AuthEnv, AuthSession, AuthUser, StaffEnv } from '@/internal/domains/auth/types';
import type { SupportRepository } from '@/internal/domains/support/repository';
import { organizationScope } from '@/internal/shared/tenancy/scope';
import { forbidden, unauthorized } from '@/internal/shared/utils/response';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

interface Caller {
  user: AuthUser;
  session: AuthSession;
  /** The support user acting as `user`, or null when `user` signed in themselves. */
  impersonatedBy: string | null;
}

type OrganizationRolesResolution =
  | { ok: true; organizationId: string; roles: AppRole[] }
  | { ok: false; message: string };

/**
 * The session behind the request, or null when there is none or it may no longer be used.
 *
 * An impersonated session lasts `IMPERSONATION_SESSION_SECONDS` from its creation. Better Auth
 * refreshes `expiresAt` on use for a client that does not send its `dont_remember` cookie, so the
 * expiry is counted from `createdAt`, which never moves. It also stops working the moment its
 * impersonator is no longer a support user, and when its active organization is not the one
 * recorded at `impersonation.start`: an impersonated session stays in the municipality it opened in.
 */
async function resolveCaller(
  authService: AuthService,
  supportRepo: SupportRepository,
  headers: Headers,
): Promise<Caller | null> {
  const found = await authService.api.getSession({ headers });
  if (!found?.user) {
    return null;
  }

  const { user, session } = found;
  const impersonatedBy = session.impersonatedBy ?? null;
  if (impersonatedBy) {
    const ageSeconds = (Date.now() - new Date(session.createdAt).getTime()) / 1000;
    if (ageSeconds > IMPERSONATION_SESSION_SECONDS || !(await supportRepo.isSupportUser(impersonatedBy))) {
      return null;
    }
    const start = await supportRepo.findImpersonationStart(session.id);
    if (!start || start.organizationId !== (session.activeOrganizationId ?? null)) {
      return null;
    }
  }
  return { user, session, impersonatedBy };
}

/**
 * Refuse an impersonated session. It guards the endpoints that would let a session choose its own
 * municipality, and passes any other session, or none, through to the handler.
 */
export function createRefuseImpersonationMiddleware(authService: AuthService) {
  return createMiddleware(async (c, next) => {
    const found = await authService.api.getSession({ headers: c.req.raw.headers });
    if (found?.session.impersonatedBy) {
      return forbidden(c, 'An impersonated session cannot change its municipality.');
    }
    await next();
  });
}

/**
 * The one place a staff or citizen request's caller is set and its impersonation is recorded, so
 * a middleware cannot admit an impersonated session without the audit. A write made while
 * impersonating gets its audit row before it runs, and a request that cannot be recorded does not
 * run. The response status is added once the request has run.
 */
async function admit(
  c: Context,
  supportRepo: SupportRepository,
  caller: Caller,
  next: () => Promise<void>,
): Promise<void> {
  c.set('user', caller.user);
  c.set('session', caller.session);
  c.set('impersonatedBy', caller.impersonatedBy);

  if (!caller.impersonatedBy || SAFE_METHODS.has(c.req.method)) {
    await next();
    return;
  }

  // The last matched route is the handler's own pattern; earlier ones may be `use('*')` wildcards.
  const auditId = await supportRepo.insertAudit({
    action: 'write',
    impersonatorId: caller.impersonatedBy,
    impersonatedUserId: caller.user.id,
    organizationId: caller.session.activeOrganizationId ?? null,
    sessionId: caller.session.id,
    method: c.req.method,
    path: matchedRoutes(c).at(-1)?.path ?? c.req.path,
  });
  await next();
  await supportRepo.recordStatus(auditId, c.res.status);
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

  return { ok: true, organizationId: activeOrganizationId, roles: toRoleList(memberRoleResponse.role) };
}

/**
 * Require a session and an active organization member role. The active organization becomes the
 * request's `scope`: every repository call for staff data runs under it.
 */
export function createAuthMiddleware(authService: AuthService, supportRepo: SupportRepository) {
  return function authMiddleware(allowedRoles: AppRole[]) {
    return createMiddleware<StaffEnv>(async (c, next) => {
      const caller = await resolveCaller(authService, supportRepo, c.req.raw.headers);
      if (!caller) {
        return unauthorized(c);
      }

      const resolution = await resolveActiveOrganizationRoles(
        authService,
        c.req.raw.headers,
        caller.session.activeOrganizationId,
      );

      if (!(resolution.ok && resolution.roles.some((role) => allowedRoles.includes(role)))) {
        return forbidden(c, resolution.ok ? undefined : resolution.message);
      }

      c.set('scope', organizationScope(resolution.organizationId));
      await admit(c, supportRepo, caller, next);
    });
  };
}

/**
 * Require a session and a specific resource/action permission, per the roles' access-control
 * statements in roles.ts. Use this instead of `createAuthMiddleware`'s role list when a handler
 * is shared by roles that should not all have the same access to it (e.g. admin vs. supervisor).
 * Like `createAuthMiddleware`, it sets the request's `scope`.
 */
export function createPermissionMiddleware(authService: AuthService, supportRepo: SupportRepository) {
  return function requirePermission(permission: PermissionRequest) {
    return createMiddleware<StaffEnv>(async (c, next) => {
      const caller = await resolveCaller(authService, supportRepo, c.req.raw.headers);
      if (!caller) {
        return unauthorized(c);
      }

      const resolution = await resolveActiveOrganizationRoles(
        authService,
        c.req.raw.headers,
        caller.session.activeOrganizationId,
      );

      if (!resolution.ok) {
        return forbidden(c, resolution.message);
      }
      if (!resolution.roles.some((role) => appPluginRoles[role].authorize(permission).success)) {
        return forbidden(c, 'Insufficient permissions');
      }

      c.set('scope', organizationScope(resolution.organizationId));
      await admit(c, supportRepo, caller, next);
    });
  };
}

/**
 * Allow authenticated users who do not have an active organization. A support user has none
 * either, but acts on citizen routes only through an impersonated session.
 */
export function createCitizenOnlyMiddleware(authService: AuthService, supportRepo: SupportRepository) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const caller = await resolveCaller(authService, supportRepo, c.req.raw.headers);
    if (!caller) {
      return unauthorized(c);
    }

    if (caller.session.activeOrganizationId || caller.user.role === PlatformRoles.SUPPORT) {
      return forbidden(c, 'This endpoint is for citizens only.');
    }

    await admit(c, supportRepo, caller, next);
  });
}

/** Require a support user's own session: reading across municipalities, and starting an impersonation. */
export function createSupportMiddleware(authService: AuthService, supportRepo: SupportRepository) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const caller = await resolveCaller(authService, supportRepo, c.req.raw.headers);
    if (!caller) {
      return unauthorized(c);
    }
    if (caller.impersonatedBy || !(await supportRepo.isSupportUser(caller.user.id))) {
      return forbidden(c, 'This endpoint is for the support team.');
    }

    c.set('user', caller.user);
    c.set('session', caller.session);
    c.set('impersonatedBy', null);
    await next();
  });
}

/** Require an impersonated session, which is the only one that can end an impersonation. */
export function createImpersonatedSessionMiddleware(authService: AuthService, supportRepo: SupportRepository) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const caller = await resolveCaller(authService, supportRepo, c.req.raw.headers);
    if (!caller) {
      return unauthorized(c);
    }
    if (!caller.impersonatedBy) {
      return forbidden(c, 'This session is not impersonated.');
    }

    c.set('user', caller.user);
    c.set('session', caller.session);
    c.set('impersonatedBy', caller.impersonatedBy);
    await next();
  });
}
