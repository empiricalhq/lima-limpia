import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { auth, bootstrapOwner, checkExistingOrganization, db } from './create-admin.ts';

beforeEach(async () => {
  await db.query('TRUNCATE TABLE organization, "user" CASCADE');
});

afterAll(async () => {
  await db.end();
});

test('reports no organization on an empty database', async () => {
  expect(await checkExistingOrganization()).toBe(false);
});

test('creates an owner whose global role and membership role both authorize as owner', async () => {
  const { userId, organizationId } = await bootstrapOwner({
    name: 'Owner Uno',
    email: `owner-${Date.now()}@test.com`,
    password: 'owner-password-123',
  });

  const { rows: userRows } = await db.query<{ role: string }>('SELECT role FROM "user" WHERE id = $1', [userId]);
  expect(userRows[0]?.role).toBe('owner');

  const { rows: memberRows } = await db.query<{ role: string }>(
    'SELECT role FROM member WHERE "userId" = $1 AND "organizationId" = $2',
    [userId, organizationId],
  );
  expect(memberRows[0]?.role).toBe('owner');

  expect(await checkExistingOrganization()).toBe(true);
});

test('lets the created owner sign in through the same auth configuration the API uses', async () => {
  const email = `signin-${Date.now()}@test.com`;
  await bootstrapOwner({ name: 'Signs In', email, password: 'owner-password-123' });

  const result = await auth.api.signInEmail({ body: { email, password: 'owner-password-123' } });
  expect(result.user.email).toBe(email);
});

test('removes the user it created when a concurrent run already took the organization slug', async () => {
  await db.query(`INSERT INTO organization (id, name, slug) VALUES (gen_random_uuid(), 'Lima Limpia', 'lima-limpia')`);

  const email = `orphan-${Date.now()}@test.com`;
  await expect(bootstrapOwner({ name: 'Late Owner', email, password: 'owner-password-123' })).rejects.toThrow();

  const { rows } = await db.query('SELECT id FROM "user" WHERE email = $1', [email]);
  expect(rows).toHaveLength(0);
});

describe('when the member insert fails', () => {
  test('leaves no organization and no user behind', async () => {
    // A real constraint rejects every insert into `member` — not a mock of the failure, and not a
    // held lock: `deleteUnusedUser`'s cleanup delete also needs to lock `member` for its FK check,
    // which would deadlock against a lock still held by this test.
    await db.query('ALTER TABLE member ADD CONSTRAINT reject_all_test CHECK (1 = 0)');

    try {
      const email = `member-check-${Date.now()}@test.com`;
      await expect(bootstrapOwner({ name: 'Blocked Owner', email, password: 'owner-password-123' })).rejects.toThrow();

      const { rows } = await db.query('SELECT id FROM "user" WHERE email = $1', [email]);
      expect(rows).toHaveLength(0);
      expect(await checkExistingOrganization()).toBe(false);
    } finally {
      await db.query('ALTER TABLE member DROP CONSTRAINT reject_all_test');
    }
  });
});
