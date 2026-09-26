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

export const appAc = createAccessControl(appAccessControlStatements);

export const appPluginRoles: { [key in AppRole]: ReturnType<(typeof appAc)['newRole']> } = {
  [AppRoles.OWNER]: appAc.newRole({
    user: ['create', 'list', 'set-role', 'ban', 'impersonate', 'delete', 'set-password'],
    session: ['list', 'revoke', 'delete'],
    route: ['create', 'read', 'update', 'delete'],
    truck: ['create', 'read', 'update', 'delete'],
    assignment: ['create', 'read', 'update', 'delete', 'start', 'complete'],
    issue: ['create', 'read', 'update', 'delete', 'report_citizen', 'report_driver'],
    location: ['read', 'update'],
  }),
  [AppRoles.ADMIN]: appAc.newRole({
    user: ['create', 'list', 'set-role', 'ban', 'impersonate', 'set-password'],
    session: ['list', 'revoke'],
    route: ['create', 'read', 'update', 'delete'],
    truck: ['create', 'read', 'update', 'delete'],
    assignment: ['create', 'read', 'update', 'delete'],
    issue: ['create', 'read', 'update', 'delete'],
    location: ['read', 'update'],
  }),
  [AppRoles.SUPERVISOR]: appAc.newRole({
    user: ['create', 'list', 'set-role'],
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
