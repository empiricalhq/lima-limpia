import { createId } from '@paralleldrive/cuid2';
import type { Pool, PoolClient } from 'pg';
import type { AppAuth } from './create-auth.ts';
import type { AppRole } from './roles.ts';
import { withTransaction } from './transaction.ts';

export type StaffUserInput =
  | { name: string; email: string; password: string; role: 'citizen'; organizationId?: undefined }
  | { name: string; email: string; password: string; role: Exclude<AppRole, 'citizen'>; organizationId: string };

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  role: AppRole;
}

/** Deletes directly because the session-guarded `removeUser` endpoint cannot undo a failed setup step. */
export async function deleteUnusedUser(pool: Pool, userId: string): Promise<void> {
  await pool.query('DELETE FROM "user" WHERE id = $1', [userId]);
}

/** Writes on the caller's transaction because Better Auth's `addMember` uses another connection. */
export async function insertMember(
  client: PoolClient,
  member: { userId: string; organizationId: string; role: Exclude<AppRole, 'citizen'> },
): Promise<void> {
  await client.query('INSERT INTO member (id, "userId", "organizationId", role) VALUES ($1, $2, $3, $4)', [
    createId(),
    member.userId,
    member.organizationId,
    member.role,
  ]);
}

/** A failed membership write deletes the user. Without membership, the user cannot pass organization checks. */
export async function createStaffUser(auth: AppAuth, pool: Pool, input: StaffUserInput): Promise<StaffUser> {
  const { user } = await auth.api.createUser({
    body: { name: input.name, email: input.email, password: input.password, role: input.role },
  });

  if (input.organizationId) {
    try {
      await withTransaction(pool, (client) =>
        insertMember(client, { userId: user.id, organizationId: input.organizationId, role: input.role }),
      );
    } catch (error) {
      await deleteUnusedUser(pool, user.id);
      throw error;
    }
  }

  return { id: user.id, name: input.name, email: input.email, createdAt: user.createdAt, role: input.role };
}

/** Returns the user with this email as it is, or creates it. An existing user is never changed. */
export async function ensureStaffUser(auth: AppAuth, pool: Pool, input: StaffUserInput): Promise<StaffUser> {
  const {
    rows: [existing],
  } = await pool.query<StaffUser>('SELECT id, name, email, "createdAt", role FROM "user" WHERE email = $1', [
    input.email,
  ]);

  return existing ?? createStaffUser(auth, pool, input);
}
