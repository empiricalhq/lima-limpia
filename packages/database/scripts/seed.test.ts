import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { auth, db, ensureUser, getOrganizationId } from './seed.ts';

let organizationId: string;

beforeEach(async () => {
  await db.query('TRUNCATE TABLE organization, "user" CASCADE');
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO organization (id, name, slug) VALUES (gen_random_uuid(), 'Seed Org', 'seed-org') RETURNING id`,
  );
  // biome-ignore lint/style/noNonNullAssertion: the insert above always returns one row.
  organizationId = rows[0]!.id;
});

afterAll(async () => {
  await db.end();
});

test('fails with a clear message when no organization exists yet', async () => {
  await db.query('TRUNCATE TABLE organization, "user" CASCADE');
  await expect(getOrganizationId()).rejects.toThrow('setup:admin');
});

describe('creating a user', () => {
  test('creates a supervisor who lands in the organization and can sign in', async () => {
    const email = `supervisor-${Date.now()}@test.com`;
    const row = await ensureUser(organizationId, { role: 'supervisor', name: 'Test Supervisor', email });

    expect(row.role).toBe('supervisor');

    const { rows: memberRows } = await db.query<{ role: string }>(
      'SELECT role FROM member WHERE "userId" = $1 AND "organizationId" = $2',
      [row.id, organizationId],
    );
    expect(memberRows[0]?.role).toBe('supervisor');

    const result = await auth.api.signInEmail({ body: { email, password: 'password123' } });
    expect(result.user.email).toBe(email);
  });

  test('creates a citizen without organization membership', async () => {
    const email = `citizen-${Date.now()}@test.com`;
    const row = await ensureUser(organizationId, { role: 'citizen', name: 'Test Citizen', email });

    expect(row.role).toBe('citizen');
    const { rows: memberRows } = await db.query('SELECT 1 FROM member WHERE "userId" = $1', [row.id]);
    expect(memberRows).toHaveLength(0);
  });

  test('is idempotent: running twice reuses the same user', async () => {
    const email = `idempotent-${Date.now()}@test.com`;
    const first = await ensureUser(organizationId, { role: 'driver', name: 'Test Driver', email });
    const second = await ensureUser(organizationId, { role: 'driver', name: 'Test Driver', email });

    expect(second.id).toBe(first.id);
    const { rows } = await db.query('SELECT id FROM "user" WHERE email = $1', [email]);
    expect(rows).toHaveLength(1);
  });
});

describe('repairing an existing user', () => {
  test('repairs a legacy user left with no membership from an earlier seed', async () => {
    const email = `legacy-${Date.now()}@test.com`;
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO "user" (id, name, email) VALUES (gen_random_uuid(), 'Legacy Supervisor', $1) RETURNING id`,
      [email],
    );
    // biome-ignore lint/style/noNonNullAssertion: the insert above always returns one row.
    const legacyId = rows[0]!.id;

    const row = await ensureUser(organizationId, { role: 'supervisor', name: 'Legacy Supervisor', email });

    expect(row.id).toBe(legacyId);
    expect(row.role).toBe('supervisor');

    const { rows: memberRows } = await db.query<{ role: string }>(
      'SELECT role FROM member WHERE "userId" = $1 AND "organizationId" = $2',
      [legacyId, organizationId],
    );
    expect(memberRows).toHaveLength(1);
    expect(memberRows[0]?.role).toBe('supervisor');
  });

  test('an existing citizen requested as citizen stays a citizen with no membership', async () => {
    const email = `citizen-repeat-${Date.now()}@test.com`;
    const first = await ensureUser(organizationId, { role: 'citizen', name: 'Test Citizen', email });
    const second = await ensureUser(organizationId, { role: 'citizen', name: 'Test Citizen', email });

    expect(second.id).toBe(first.id);
    expect(second.role).toBe('citizen');
    const { rows: memberRows } = await db.query('SELECT 1 FROM member WHERE "userId" = $1', [second.id]);
    expect(memberRows).toHaveLength(0);
  });

  test('refuses to repair a user who already belongs to a different organization', async () => {
    const { rows: otherOrgRows } = await db.query<{ id: string }>(
      `INSERT INTO organization (id, name, slug) VALUES (gen_random_uuid(), 'Other Org', 'other-org') RETURNING id`,
    );
    // biome-ignore lint/style/noNonNullAssertion: the insert above always returns one row.
    const otherOrganizationId = otherOrgRows[0]!.id;

    const email = `cross-org-${Date.now()}@test.com`;
    await ensureUser(otherOrganizationId, { role: 'driver', name: 'Cross Org', email });

    await expect(ensureUser(organizationId, { role: 'driver', name: 'Cross Org', email })).rejects.toThrow(email);
  });
});

const DUPLICATE_MEMBERSHIP_ERROR = /duplicate key value violates unique constraint/;

describe('the unique index on member (organizationId, userId)', () => {
  test('rejects a second membership for the same user and organization', async () => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO "user" (id, name, email) VALUES (gen_random_uuid(), 'Double Member', 'double-member@test.com') RETURNING id`,
    );
    // biome-ignore lint/style/noNonNullAssertion: the insert above always returns one row.
    const userId = rows[0]!.id;

    await db.query(`INSERT INTO member (id, "userId", "organizationId", role) VALUES (gen_random_uuid(), $1, $2, $3)`, [
      userId,
      organizationId,
      'driver',
    ]);

    await expect(
      db.query(`INSERT INTO member (id, "userId", "organizationId", role) VALUES (gen_random_uuid(), $1, $2, $3)`, [
        userId,
        organizationId,
        'supervisor',
      ]),
    ).rejects.toThrow(DUPLICATE_MEMBERSHIP_ERROR);
  });
});

describe('when a user.role write fails while repairing a legacy user', () => {
  test('leaves member.role (here, the membership itself) unchanged', async () => {
    const email = `legacy-check-${Date.now()}@test.com`;
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO "user" (id, name, email) VALUES (gen_random_uuid(), 'Legacy Supervisor', $1) RETURNING id`,
      [email],
    );
    // biome-ignore lint/style/noNonNullAssertion: the insert above always returns one row.
    const legacyId = rows[0]!.id;

    // A real constraint rejects the specific `user.role` write the repair needs, a real, unmocked
    // way to make the second half of the repair fail after the member insert already ran.
    await db.query(`ALTER TABLE "user" ADD CONSTRAINT reject_supervisor_test CHECK (role <> 'supervisor')`);

    try {
      await expect(
        ensureUser(organizationId, { role: 'supervisor', name: 'Legacy Supervisor', email }),
      ).rejects.toThrow();

      const { rows: userRows } = await db.query<{ role: string }>('SELECT role FROM "user" WHERE id = $1', [legacyId]);
      expect(userRows[0]?.role).toBe('user');

      const { rows: memberRows } = await db.query('SELECT 1 FROM member WHERE "userId" = $1', [legacyId]);
      expect(memberRows).toHaveLength(0);
    } finally {
      await db.query('ALTER TABLE "user" DROP CONSTRAINT reject_supervisor_test');
    }
  });
});
