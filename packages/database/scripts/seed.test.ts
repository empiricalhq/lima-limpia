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
  await expect(getOrganizationId()).rejects.toThrow('setup:municipality');
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

  test.each(['driver', 'citizen'] as const)('is idempotent: running twice reuses the same %s', async (role) => {
    const email = `idempotent-${role}-${Date.now()}@test.com`;
    const first = await ensureUser(organizationId, { role, name: 'Test User', email });
    const second = await ensureUser(organizationId, { role, name: 'Test User', email });

    expect(second.id).toBe(first.id);
    expect(second.role).toBe(role);
    const { rows } = await db.query('SELECT id FROM "user" WHERE email = $1', [email]);
    expect(rows).toHaveLength(1);
  });
});
