import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { auth, bootstrapOwner, db } from './create-municipality.ts';

beforeEach(async () => {
  await db.query('TRUNCATE TABLE organization, "user" CASCADE');
});

afterAll(async () => {
  await db.end();
});

const municipality = (slug: string) => ({ municipalityName: `Municipalidad ${slug}`, municipalitySlug: slug });

test('creates an owner whose global role and membership role both authorize as owner', async () => {
  const { userId, organizationId } = await bootstrapOwner({
    ...municipality('miraflores'),
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

  const { rows: organizationRows } = await db.query<{ name: string; slug: string }>(
    'SELECT name, slug FROM organization WHERE id = $1',
    [organizationId],
  );
  expect(organizationRows[0]).toEqual({ name: 'Municipalidad miraflores', slug: 'miraflores' });
});

test('creates a second municipality whose owner belongs to that municipality only', async () => {
  const first = await bootstrapOwner({
    ...municipality('miraflores'),
    name: 'Owner Uno',
    email: `first-${Date.now()}@test.com`,
    password: 'owner-password-123',
  });
  const second = await bootstrapOwner({
    ...municipality('san-isidro'),
    name: 'Owner Dos',
    email: `second-${Date.now()}@test.com`,
    password: 'owner-password-123',
  });

  expect(second.organizationId).not.toBe(first.organizationId);

  const { rows } = await db.query<{ userId: string; organizationId: string }>(
    'SELECT "userId", "organizationId" FROM member ORDER BY "userId"',
  );
  expect(rows.map((row) => `${row.userId}:${row.organizationId}`).sort()).toEqual(
    [`${first.userId}:${first.organizationId}`, `${second.userId}:${second.organizationId}`].sort(),
  );
});

test('lets the created owner sign in through the same auth configuration the API uses', async () => {
  const email = `signin-${Date.now()}@test.com`;
  await bootstrapOwner({ ...municipality('miraflores'), name: 'Signs In', email, password: 'owner-password-123' });

  const result = await auth.api.signInEmail({ body: { email, password: 'owner-password-123' } });
  expect(result.user.email).toBe(email);
});

test('removes the user it created when the municipality slug is already taken', async () => {
  await db.query(`INSERT INTO organization (id, name, slug) VALUES (gen_random_uuid(), 'Existing', 'miraflores')`);

  const email = `orphan-${Date.now()}@test.com`;
  await expect(
    bootstrapOwner({ ...municipality('miraflores'), name: 'Late Owner', email, password: 'owner-password-123' }),
  ).rejects.toThrow();

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
      await expect(
        bootstrapOwner({ ...municipality('miraflores'), name: 'Blocked Owner', email, password: 'owner-password-123' }),
      ).rejects.toThrow();

      const { rows } = await db.query('SELECT id FROM "user" WHERE email = $1', [email]);
      expect(rows).toHaveLength(0);
      const { rows: organizationRows } = await db.query('SELECT id FROM organization');
      expect(organizationRows).toHaveLength(0);
    } finally {
      await db.query('ALTER TABLE member DROP CONSTRAINT reject_all_test');
    }
  });
});
