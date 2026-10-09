import { afterAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS_DIR = join(import.meta.dir, '..', 'migrations');

const PRE_MIGRATIONS = [
  '0000_giant_mauler.sql',
  '0001_wild_red_hulk.sql',
  '0002_public_forge.sql',
  '0003_zippy_rhino.sql',
  '0004_striped_silver_surfer.sql',
  '0005_brown_spacker_dave.sql',
];
const MIGRATION_UNDER_TEST = '0006_ancient_thing.sql';
const DUPLICATE_MEMBERSHIP_ERROR = /duplicate key value violates unique constraint/;

function applyMigration(db: PGlite, fileName: string): Promise<unknown> {
  return db.exec(readFileSync(join(MIGRATIONS_DIR, fileName), 'utf8'));
}

const scratchDatabases: PGlite[] = [];

async function createScratchDatabase(): Promise<PGlite> {
  const db = await PGlite.create();
  scratchDatabases.push(db);
  for (const fileName of PRE_MIGRATIONS) {
    // Each migration's SQL depends on the schema state the previous one left, so these must apply
    // in order, not concurrently.
    // biome-ignore lint/performance/noAwaitInLoops: applying migrations out of order would build the wrong schema.
    await applyMigration(db, fileName);
  }
  return db;
}

afterAll(async () => {
  await Promise.all(scratchDatabases.map((db) => db.close()));
});

interface DuplicateMemberPair {
  organizationId: string;
  userId: string;
  earliestId: string;
}

/**
 * Inserts an organization, a user, and two `member` rows duplicating the same
 * (organizationId, userId) pair the pre-0006 schema never rejected: one with an earlier
 * `createdAt` (role `supervisor`), one later (role `admin`).
 */
async function insertDuplicateMemberPair(db: PGlite): Promise<DuplicateMemberPair> {
  const { rows: organizationRows } = await db.query<{ id: string }>(
    `INSERT INTO organization (id, name, slug) VALUES (gen_random_uuid(), 'Org', 'org-slug') RETURNING id`,
  );
  // biome-ignore lint/style/noNonNullAssertion: the insert above always returns one row.
  const organizationId = organizationRows[0]!.id;

  const { rows: userRows } = await db.query<{ id: string }>(
    `INSERT INTO "user" (id, name, email, "emailVerified", role) VALUES (gen_random_uuid(), 'Dup User', 'dup@test.com', true, 'supervisor') RETURNING id`,
  );
  // biome-ignore lint/style/noNonNullAssertion: the insert above always returns one row.
  const userId = userRows[0]!.id;

  // Better Auth's kysely adapter builds `SELECT * FROM member WHERE "userId" = $1 AND
  // "organizationId" = $2` with no ORDER BY and no LIMIT, so it returns whichever row Postgres
  // happens to return first; verified against this same pre-migration schema that both an index
  // scan (via the pre-migration "member_user_org_idx") and a forced sequential scan return the
  // earliest-created row first for rows that have never been updated. The migration's dedupe
  // keeps that same row.
  const { rows: earliestRows } = await db.query<{ id: string }>(
    `INSERT INTO member (id, "userId", "organizationId", role, "createdAt") VALUES (gen_random_uuid(), $1, $2, 'supervisor', now() - interval '1 day') RETURNING id`,
    [userId, organizationId],
  );
  // biome-ignore lint/style/noNonNullAssertion: the insert above always returns one row.
  const earliestId = earliestRows[0]!.id;

  await db.query(
    `INSERT INTO member (id, "userId", "organizationId", role, "createdAt") VALUES (gen_random_uuid(), $1, $2, 'admin', now()) RETURNING id`,
    [userId, organizationId],
  );

  return { organizationId, userId, earliestId };
}

test('drops duplicate member rows for the same (organizationId, userId) before the unique index, keeping the earliest', async () => {
  const db = await createScratchDatabase();

  const { organizationId, userId, earliestId } = await insertDuplicateMemberPair(db);

  const { rows: beforeRows } = await db.query('SELECT id FROM member WHERE "userId" = $1', [userId]);
  expect(beforeRows).toHaveLength(2);

  await applyMigration(db, MIGRATION_UNDER_TEST);

  const { rows: afterRows } = await db.query<{ id: string; role: string }>(
    'SELECT id, role FROM member WHERE "userId" = $1 AND "organizationId" = $2',
    [userId, organizationId],
  );
  expect(afterRows).toHaveLength(1);
  expect(afterRows[0]?.id).toBe(earliestId);
  expect(afterRows[0]?.role).toBe('supervisor');

  const { rows: indexRows } = await db.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes WHERE tablename = 'member' AND indexname = 'member_organization_user_uidx'`,
  );
  expect(indexRows).toHaveLength(1);
  expect(indexRows[0]?.indexdef).toContain('UNIQUE INDEX');

  await expect(
    db.query(`INSERT INTO member (id, "userId", "organizationId", role) VALUES (gen_random_uuid(), $1, $2, 'driver')`, [
      userId,
      organizationId,
    ]),
  ).rejects.toThrow(DUPLICATE_MEMBERSHIP_ERROR);
});
