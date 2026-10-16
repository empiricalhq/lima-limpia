export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  SUPERVISOR: 'supervisor',
  DRIVER: 'driver',
  CITIZEN: 'citizen',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const PROTECTED_ROLES: Role[] = [ROLES.OWNER, ROLES.ADMIN, ROLES.SUPERVISOR];

export const SETTINGS_ROLES: Role[] = [ROLES.OWNER, ROLES.ADMIN];

export function hasAnyRole(userRoles: string[], allowedRoles: Role[]): boolean {
  return allowedRoles.some((role) => userRoles.includes(role));
}

/** Split comma-joined memberships before matching their roles. */
export function toRoleList(role: string | string[] | undefined | null): string[] {
  if (!role) {
    return [];
  }
  return Array.isArray(role) ? role : role.split(',').filter(Boolean);
}

/** These statuses mean the user has no role. Any other status means the lookup failed. */
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const MEMBER_ROLE_ABSENT_STATUSES = new Set([HTTP_BAD_REQUEST, HTTP_FORBIDDEN]);

export function isMemberRoleAbsent(status: number): boolean {
  return MEMBER_ROLE_ABSENT_STATUSES.has(status);
}
