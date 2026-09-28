import type { PoolClient, QueryResultRow } from 'pg';
import type { DatabaseInterface } from '@/internal/shared/database/database';
import type { Scope, WriteScope } from './scope';
import { bindScope, type TenantQuery } from './tenant-query';

export interface TenantResult<R> {
  rows: R[];
  count: number;
}

/** Statements run inside one transaction, still bound to the scope the transaction was opened with. */
export interface TenantTransaction {
  read: <R extends QueryResultRow>(query: TenantQuery, params?: readonly unknown[]) => Promise<TenantResult<R>>;
  write: <R extends QueryResultRow>(query: TenantQuery, params?: readonly unknown[]) => Promise<TenantResult<R>>;
}

/**
 * Base for repositories of tenant tables. It has no raw query method: a statement runs only as a
 * {@link TenantQuery} together with a scope, so a repository method cannot forget the tenant filter.
 */
export abstract class TenantRepository {
  protected readonly db: DatabaseInterface;

  constructor(db: DatabaseInterface) {
    this.db = db;
  }

  protected async read<R extends QueryResultRow>(
    scope: Scope,
    query: TenantQuery,
    params: readonly unknown[] = [],
  ): Promise<TenantResult<R>> {
    const bound = bindScope(query, scope, params);
    const result = await this.db.query<R>(bound.text, bound.values);
    return { rows: result.rows, count: result.rowCount };
  }

  protected async readOne<R extends QueryResultRow>(
    scope: Scope,
    query: TenantQuery,
    params: readonly unknown[] = [],
  ): Promise<R | null> {
    const { rows } = await this.read<R>(scope, query, params);
    return rows[0] ?? null;
  }

  protected write<R extends QueryResultRow>(
    scope: WriteScope,
    query: TenantQuery,
    params: readonly unknown[] = [],
  ): Promise<TenantResult<R>> {
    return this.read<R>(scope, query, params);
  }

  protected transaction<T>(scope: WriteScope, callback: (tx: TenantTransaction) => Promise<T>): Promise<T> {
    return this.db.withTransaction((client) => callback(bindTransaction(client, scope)));
  }
}

async function run<R extends QueryResultRow>(
  client: PoolClient,
  scope: Scope,
  query: TenantQuery,
  params: readonly unknown[],
): Promise<TenantResult<R>> {
  const bound = bindScope(query, scope, params);
  const result = await client.query<R>(bound.text, bound.values);
  return { rows: result.rows, count: result.rowCount ?? 0 };
}

function bindTransaction(client: PoolClient, scope: WriteScope): TenantTransaction {
  return {
    read: (query, params = []) => run(client, scope, query, params),
    write: (query, params = []) => run(client, scope, query, params),
  };
}
