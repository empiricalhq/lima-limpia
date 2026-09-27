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

/** Deletes a user directly, bypassing the session-guarded `removeUser` endpoint, so a failed step right after `createUser` (a missing membership, a taken organization slug) leaves nothing behind. */
export async function deleteUnusedUser(pool: Pool, userId: string): Promise<void> {
  await pool.query('DELETE FROM "user" WHERE id = $1', [userId]);
}

/**
 * Inserts a `member` row directly with the columns Better Auth's own `addMember` would write,
 * instead of calling that endpoint: it runs through Better Auth's own connection, which cannot
 * join a transaction this package holds open on `pool`, and every caller here needs the member
 * write to land together with another write (the owner's organization row, or a repaired
 * `user.role`) or not at all. The unique index on `(organizationId, userId)` rejects a second
 * membership for the same user in the same organization.
 */
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

/**
 * Creates a Better Auth user and, when given an organization, its membership, so both API-facing
 * and script-facing callers create users the same way. If the membership write fails, deletes the
 * user rather than leaving one with no membership: org-gated routes resolve roles from
 * membership, not the bare `user.role`, so such a user could never sign in past those checks.
 */
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

/**
 * Creates a staff or citizen user by email, or, if one already exists, brings it to the
 * invariant this input describes instead of returning it unchanged: a user left by an earlier
 * run (say, the default global role "user" with no membership) would otherwise stay unable to
 * pass organization-scoped authorization forever. Keeps the existing user's id, since other rows
 * (routes, assignments) may already reference it. Throws, naming the email, when the existing
 * user already belongs to a different organization: moving that membership is not something this
 * function can decide is safe.
 *
 * Writes the repaired membership and the repaired `user.role` in one transaction (`insertMember`
 * or the `member.role` update, then `user.role`), so a rejected membership write (the unique index
 * on `(organizationId, userId)`, if a concurrent call already inserted the same membership, or a
 * foreign key violation, if the organization was deleted concurrently) leaves the legacy row
 * exactly as it was instead of a role with no membership behind it.
 */
export async function ensureStaffUser(auth: AppAuth, pool: Pool, input: StaffUserInput): Promise<StaffUser> {
  const {
    rows: [existing],
  } = await pool.query<{ id: string; name: string; email: string; createdAt: Date; role: string }>(
    'SELECT id, name, email, "createdAt", role FROM "user" WHERE email = $1',
    [input.email],
  );

  if (!existing) {
    return createStaffUser(auth, pool, input);
  }

  const { rows: memberships } = await pool.query<{ id: string; organizationId: string; role: string }>(
    'SELECT id, "organizationId", role FROM member WHERE "userId" = $1',
    [existing.id],
  );

  if (input.role === 'citizen') {
    if (memberships.length > 0) {
      throw new Error(`No se puede convertir a "${input.email}" en ciudadano: ya pertenece a una organización.`);
    }
    if (existing.role !== 'citizen') {
      await pool.query('UPDATE "user" SET role = $1 WHERE id = $2', ['citizen', existing.id]);
    }
    return {
      id: existing.id,
      name: existing.name,
      email: existing.email,
      createdAt: existing.createdAt,
      role: 'citizen',
    };
  }

  if (memberships.some((m) => m.organizationId !== input.organizationId)) {
    throw new Error(`No se puede convertir a "${input.email}" en personal de esta organización: ya pertenece a otra.`);
  }

  const { organizationId } = input;
  const membership = memberships.find((m) => m.organizationId === organizationId);
  await withTransaction(pool, async (client) => {
    if (!membership) {
      await insertMember(client, { userId: existing.id, organizationId, role: input.role });
    } else if (membership.role !== input.role) {
      await client.query('UPDATE member SET role = $1 WHERE id = $2', [input.role, membership.id]);
    }

    if (existing.role !== input.role) {
      await client.query('UPDATE "user" SET role = $1 WHERE id = $2', [input.role, existing.id]);
    }
  });

  return {
    id: existing.id,
    name: existing.name,
    email: existing.email,
    createdAt: existing.createdAt,
    role: input.role,
  };
}
