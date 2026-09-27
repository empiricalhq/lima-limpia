import { afterAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { mustEnv } from './env.ts';

const SCRATCH_NAME_RANDOM_RANGE = 1_000_000;

const DATABASE_URL = mustEnv('DATABASE_URL');
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

function readMigration(fileName: string): string {
  return readFileSync(join(MIGRATIONS_DIR, fileName), 'utf8');
}

function withDatabaseName(name: string): string {
  const url = new URL(DATABASE_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

const scratchDatabases: string[] = [];

async function createScratchDatabase(): Promise<Pool> {
  const name = `member_uidx_migration_${Date.now()}_${Math.floor(Math.random() * SCRATCH_NAME_RANDOM_RANGE)}`;
  const admin = new Pool({ connectionString: withDatabaseName('postgres') });
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
  scratchDatabases.push(name);

  const pool = new Pool({ connectionString: withDatabaseName(name) });
  for (const fileName of PRE_MIGRATIONS) {
    // Each migration's SQL depends on the schema state the previous one left, so these must apply
    // in order, not concurrently.
    // biome-ignore lint/performance/noAwaitInLoops: applying migrations out of order would build the wrong schema.
    await pool.query(readMigration(fileName));
  }
  return pool;
}

afterAll(async () => {
  const admin = new Pool({ connectionString: withDatabaseName('postgres') });
  try {
    await Promise.all(scratchDatabases.map((name) => admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)));
  } finally {
    await admin.end();
  }
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
async function insertDuplicateMemberPair(pool: Pool): Promise<DuplicateMemberPair> {
  const { rows: organizationRows } = await pool.query<{ id: string }>(
    `INSERT INTO organization (id, name, slug) VALUES (gen_random_uuid(), 'Org', 'org-slug') RETURNING id`,
  );
  // biome-ignore lint/style/noNonNullAssertion: the insert above always returns one row.
  const organizationId = organizationRows[0]!.id;

  const { rows: userRows } = await pool.query<{ id: string }>(
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
  const { rows: earliestRows } = await pool.query<{ id: string }>(
    `INSERT INTO member (id, "userId", "organizationId", role, "createdAt") VALUES (gen_random_uuid(), $1, $2, 'supervisor', now() - interval '1 day') RETURNING id`,
    [userId, organizationId],
  );
  // biome-ignore lint/style/noNonNullAssertion: the insert above always returns one row.
  const earliestId = earliestRows[0]!.id;

  await pool.query(
    `INSERT INTO member (id, "userId", "organizationId", role, "createdAt") VALUES (gen_random_uuid(), $1, $2, 'admin', now()) RETURNING id`,
    [userId, organizationId],
  );

  return { organizationId, userId, earliestId };
}

test('drops duplicate member rows for the same (organizationId, userId) before the unique index, keeping the earliest', async () => {
  const pool = await createScratchDatabase();

  try {
    const { organizationId, userId, earliestId } = await insertDuplicateMemberPair(pool);

    const { rows: beforeRows } = await pool.query('SELECT id FROM member WHERE "userId" = $1', [userId]);
    expect(beforeRows).toHaveLength(2);

    await pool.query(readMigration(MIGRATION_UNDER_TEST));

    const { rows: afterRows } = await pool.query<{ id: string; role: string }>(
      'SELECT id, role FROM member WHERE "userId" = $1 AND "organizationId" = $2',
      [userId, organizationId],
    );
    expect(afterRows).toHaveLength(1);
    expect(afterRows[0]?.id).toBe(earliestId);
    expect(afterRows[0]?.role).toBe('supervisor');

    const { rows: indexRows } = await pool.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'member' AND indexname = 'member_organization_user_uidx'`,
    );
    expect(indexRows).toHaveLength(1);
    expect(indexRows[0]?.indexdef).toContain('UNIQUE INDEX');

    await expect(
      pool.query(
        `INSERT INTO member (id, "userId", "organizationId", role) VALUES (gen_random_uuid(), $1, $2, 'driver')`,
        [userId, organizationId],
      ),
    ).rejects.toThrow(DUPLICATE_MEMBERSHIP_ERROR);
  } finally {
    await pool.end();
  }
});
