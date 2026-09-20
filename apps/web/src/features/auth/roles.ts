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
