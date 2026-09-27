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

/**
 * Better Auth returns a member role as a single string or, with multi-role support, a list. A
 * multi-role membership is stored as one comma-joined string (`parseRoles` in the organization
 * plugin serializes `["driver", "admin"]` as `"driver,admin"`), so a single string must still be
 * split before matching against `PROTECTED_ROLES`/`SETTINGS_ROLES`.
 */
export function toRoleList(role: string | string[] | undefined | null): string[] {
  if (!role) {
    return [];
  }
  return Array.isArray(role) ? role : role.split(',').filter(Boolean);
}

/**
 * `get-active-member-role` answers these two statuses with "the user has no active member
 * role" (`NO_ACTIVE_ORGANIZATION`, `YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION`), a true
 * negative that should be treated as a citizen. Any other failure (5xx, a network error) means
 * the lookup itself failed and must not be read as "no role" — callers must fail the request
 * instead of concluding the user lacks access.
 */
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const MEMBER_ROLE_ABSENT_STATUSES = new Set([HTTP_BAD_REQUEST, HTTP_FORBIDDEN]);

export function isMemberRoleAbsent(status: number): boolean {
  return MEMBER_ROLE_ABSENT_STATUSES.has(status);
}
