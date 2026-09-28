import type { Scope } from './scope';

const SCOPE_MARKER = /\{\{scope:([a-z_][a-z0-9_]*)\}\}/g;
const ORGANIZATION_ID_MARKER = /\{\{organization_id\}\}/g;

declare const tenantQueryBrand: unique symbol;

/**
 * SQL that has been checked to name its tenant filter through a marker. The only way to build one
 * is {@link tenantQuery}, and the only way to run one is through a scope, so a statement on a
 * tenant table cannot reach the database without one.
 */
export interface TenantQuery {
  readonly [tenantQueryBrand]: true;
  readonly text: string;
}

/**
 * `{{scope:alias}}` stands for the organization filter on `alias` in a WHERE clause.
 * `{{organization_id}}` stands for the owning organization in an INSERT.
 * A hand-written `organization_id = $1` does not count: the filter must come from the scope.
 */
export function tenantQuery(text: string): TenantQuery {
  if (!(text.match(SCOPE_MARKER) || text.match(ORGANIZATION_ID_MARKER))) {
    throw new Error(`A tenant query needs a {{scope:alias}} or {{organization_id}} marker: ${text.trim()}`);
  }
  return { text } as TenantQuery;
}

export interface BoundQuery {
  text: string;
  values: unknown[];
}

/** The organization is bound after the caller's parameters so their numbering stays stable. */
export function bindScope(query: TenantQuery, scope: Scope, params: readonly unknown[] = []): BoundQuery {
  const organizationParam = `$${params.length + 1}`;
  const values = [...params];
  if (scope.kind === 'organization') {
    values.push(scope.organizationId);
  }

  const text = query.text
    .replace(SCOPE_MARKER, (_marker, alias: string) => {
      if (scope.kind === 'organization') {
        return `${alias}.organization_id = ${organizationParam}`;
      }
      return scope.kind === 'all' ? 'TRUE' : `${alias}.organization_id IS NULL`;
    })
    .replace(ORGANIZATION_ID_MARKER, () => {
      if (scope.kind === 'all') {
        throw new Error('A row cannot be written into all organizations.');
      }
      return scope.kind === 'organization' ? organizationParam : 'NULL';
    });

  return { text, values };
}
