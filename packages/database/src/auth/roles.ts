import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements as adminDefaultStatements } from 'better-auth/plugins/admin/access';

const appAccessControlStatements = {
  ...adminDefaultStatements,
  route: ['create', 'read', 'update', 'delete'],
  truck: ['create', 'read', 'update', 'delete'],
  assignment: ['create', 'read', 'update', 'delete', 'start', 'complete'],
  issue: ['create', 'read', 'update', 'delete', 'report_citizen', 'report_driver'],
  location: ['read', 'update'],
} as const;

export const AppRoles = {
  OWNER: 'owner',
  ADMIN: 'admin',
  SUPERVISOR: 'supervisor',
  DRIVER: 'driver',
  CITIZEN: 'citizen',
} as const;

export type AppRole = (typeof AppRoles)[keyof typeof AppRoles];

/** Roles each role may create and edit. A supervisor can create users but must not be able to mint or edit admins. */
const MANAGEABLE_ROLES: Record<AppRole, readonly AppRole[]> = {
  [AppRoles.OWNER]: [AppRoles.ADMIN, AppRoles.SUPERVISOR, AppRoles.DRIVER],
  [AppRoles.ADMIN]: [AppRoles.ADMIN, AppRoles.SUPERVISOR, AppRoles.DRIVER],
  [AppRoles.SUPERVISOR]: [AppRoles.DRIVER],
  [AppRoles.DRIVER]: [],
  [AppRoles.CITIZEN]: [],
};

export function canManageRole(callerRoles: readonly AppRole[], targetRole: AppRole): boolean {
  return callerRoles.some((role) => MANAGEABLE_ROLES[role]?.includes(targetRole));
}

/**
 * Better Auth's `getActiveMemberRole` returns a member's role as a single string or, with
 * multi-role support, a list. A multi-role membership is stored as one comma-joined string
 * (`parseRoles` in the organization plugin serializes `["driver", "admin"]` as `"driver,admin"`),
 * so a single string must still be split before matching against `allowedRoles`/`canManageRole`.
 */
export function toRoleList(role: string | string[] | undefined | null): AppRole[] {
  if (!role) {
    return [];
  }
  return (Array.isArray(role) ? role : role.split(',').filter(Boolean)) as AppRole[];
}

export const appAc = createAccessControl(appAccessControlStatements);

export const appPluginRoles: { [key in AppRole]: ReturnType<(typeof appAc)['newRole']> } = {
  [AppRoles.OWNER]: appAc.newRole({
    user: ['create', 'list'],
    session: ['list', 'revoke', 'delete'],
    route: ['create', 'read', 'update', 'delete'],
    truck: ['create', 'read', 'update', 'delete'],
    assignment: ['create', 'read', 'update', 'delete', 'start', 'complete'],
    issue: ['create', 'read', 'update', 'delete', 'report_citizen', 'report_driver'],
    location: ['read', 'update'],
  }),
  [AppRoles.ADMIN]: appAc.newRole({
    user: ['create', 'list'],
    session: ['list', 'revoke'],
    route: ['create', 'read', 'update', 'delete'],
    truck: ['create', 'read', 'update', 'delete'],
    assignment: ['create', 'read', 'update', 'delete'],
    issue: ['create', 'read', 'update', 'delete'],
    location: ['read', 'update'],
  }),
  [AppRoles.SUPERVISOR]: appAc.newRole({
    user: ['create', 'list'],
    session: ['list'],
    route: ['create', 'read', 'update'],
    truck: ['read'],
    assignment: ['create', 'read'],
    issue: ['read'],
    location: ['read'],
  }),
  [AppRoles.DRIVER]: appAc.newRole({
    user: [],
    session: [],
    route: ['read'],
    truck: ['read'],
    assignment: ['read', 'start', 'complete'],
    issue: ['report_driver'],
    location: ['update'],
  }),
  [AppRoles.CITIZEN]: appAc.newRole({
    user: [],
    session: [],
    route: [],
    truck: [],
    assignment: [],
    issue: ['report_citizen'],
    location: ['read'],
  }),
};

/** A resource/action permission check, e.g. `{ truck: ['create'] }`. Every role above declares all resource keys, so any role's `authorize` signature is representative. */
export type PermissionRequest = Parameters<(typeof appPluginRoles)['owner']['authorize']>[0];

/**
 * The platform role, held in the global `user.role`. It is not an `AppRole`: no municipality has a
 * member with it, `canManageRole` never lists it, and `member_role_enum` cannot store it.
 */
export const PlatformRoles = {
  SUPPORT: 'support',
} as const;

export type PlatformRole = (typeof PlatformRoles)[keyof typeof PlatformRoles];

/**
 * Roles for the `admin` plugin only, not `organization` or `requirePermission`. The plugin reads
 * the global `user.role`, and its `createUser` rejects a role missing from this set, so every
 * `AppRole` is listed with no grant. Passing `appPluginRoles` instead would hand the plugin's own
 * endpoints the route-level grants, and those have no equivalent to `canManageRole`'s hierarchy.
 *
 * Support may only impersonate. `impersonate-admins` is withheld and `support` is the plugin's
 * only admin role, so a support user can never be impersonated.
 */
export const platformAdminPluginRoles = {
  [AppRoles.OWNER]: appAc.newRole({}),
  [AppRoles.ADMIN]: appAc.newRole({}),
  [AppRoles.SUPERVISOR]: appAc.newRole({}),
  [AppRoles.DRIVER]: appAc.newRole({}),
  [AppRoles.CITIZEN]: appAc.newRole({}),
  [PlatformRoles.SUPPORT]: appAc.newRole({ user: ['impersonate'] }),
};

/** An impersonated session lives this long from creation. It is never renewed. */
const IMPERSONATION_MINUTES = 15;
const SECONDS_PER_MINUTE = 60;
export const IMPERSONATION_SESSION_SECONDS = IMPERSONATION_MINUTES * SECONDS_PER_MINUTE;
