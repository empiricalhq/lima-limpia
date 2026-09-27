import type { Pool, PoolClient } from 'pg';

/**
 * Runs `fn` inside one `BEGIN`/`COMMIT` on a single connection, rolling back on any error. Use
 * this for writes to `user`, `organization`, and `member` that must land together: Better Auth's
 * own API calls (`createUser`, `createOrganization`, `addMember`, ...) run through its own
 * connection and cannot join this transaction, so those rows go through Better Auth first and
 * only the rows this package writes itself belong inside `fn`.
 */
export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
