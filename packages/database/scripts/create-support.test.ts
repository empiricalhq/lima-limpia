import { afterAll, beforeEach, expect, test } from 'bun:test';
import { createId } from '@paralleldrive/cuid2';
import { bootstrapOwner } from './create-municipality.ts';
import { db, grantSupport, revokeSupport } from './create-support.ts';

beforeEach(async () => {
  await db.query('TRUNCATE TABLE organization, "user" CASCADE');
});

afterAll(async () => {
  await db.end();
});

const roleOf = async (userId: string) =>
  (await db.query<{ role: string }>('SELECT role FROM "user" WHERE id = $1', [userId])).rows[0]?.role;

test('creates a dedicated account whose global role is support and that belongs to no municipality', async () => {
  const { userId } = await grantSupport({
    name: 'Soporte Uno',
    email: 'soporte@test.com',
    password: 'support-password-123',
  });

  expect(await roleOf(userId)).toBe('support');
  const { rows: memberships } = await db.query('SELECT 1 FROM member WHERE "userId" = $1', [userId]);
  expect(memberships).toEqual([]);
  const { rows: accounts } = await db.query('SELECT 1 FROM account WHERE "userId" = $1 AND "providerId" = $2', [
    userId,
    'credential',
  ]);
  expect(accounts).toHaveLength(1);
});

test('refuses an email that already has an account and leaves that account as it was', async () => {
  const { userId } = await bootstrapOwner({
    municipalityName: 'Municipalidad de prueba',
    municipalitySlug: 'prueba',
    name: 'Owner Uno',
    email: 'owner@test.com',
    password: 'owner-password-123',
  });

  await expect(
    grantSupport({ name: 'Owner Uno', email: 'owner@test.com', password: 'support-password-123' }),
  ).rejects.toThrow();

  expect(await roleOf(userId)).toBe('owner');
});

test('revoking returns the account to a citizen and ends its sessions', async () => {
  const { userId } = await grantSupport({
    name: 'Soporte Uno',
    email: 'soporte@test.com',
    password: 'support-password-123',
  });
  await db.query(
    `INSERT INTO session (id, "expiresAt", token, "userId") VALUES ($1, now() + interval '1 day', $2, $3)`,
    [createId(), createId(), userId],
  );

  await revokeSupport('soporte@test.com');

  expect(await roleOf(userId)).toBe('citizen');
  expect((await db.query('SELECT 1 FROM session WHERE "userId" = $1', [userId])).rows).toEqual([]);
});

test('revoking refuses an account that is not a support account', async () => {
  const { userId } = await bootstrapOwner({
    municipalityName: 'Municipalidad de prueba',
    municipalitySlug: 'prueba',
    name: 'Owner Uno',
    email: 'owner@test.com',
    password: 'owner-password-123',
  });

  await expect(revokeSupport('owner@test.com')).rejects.toThrow();
  await expect(revokeSupport('nobody@test.com')).rejects.toThrow();

  expect(await roleOf(userId)).toBe('owner');
});
