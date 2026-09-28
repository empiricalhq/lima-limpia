/** Rows owned by one municipality. Every staff request runs under the caller's active organization. */
export interface OrganizationScope {
  readonly kind: 'organization';
  readonly organizationId: string;
}

/** Rows no municipality owns yet: a citizen report filed outside every municipality's reach. */
export interface UnassignedScope {
  readonly kind: 'unassigned';
}

/** Every municipality at once. Only global citizen views and report routing may ask for it. */
export interface AllScope {
  readonly kind: 'all';
}

/** A scope a row can be written under: a row always has one owner, or none. */
export type WriteScope = OrganizationScope | UnassignedScope;
export type Scope = WriteScope | AllScope;

export function organizationScope(organizationId: string): OrganizationScope {
  if (!organizationId) {
    throw new Error('An organization scope needs an organization id.');
  }
  return { kind: 'organization', organizationId };
}

export const unassignedScope: UnassignedScope = { kind: 'unassigned' };

export const allOrganizations: AllScope = { kind: 'all' };
