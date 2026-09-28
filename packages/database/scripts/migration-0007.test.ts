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
  '0006_ancient_thing.sql',
];
const MIGRATION_UNDER_TEST = '0007_organization_tenancy.sql';

const TENANT_TABLES = [
  'truck',
  'route',
  'route_waypoint',
  'route_schedule',
  'route_assignment',
  'driver_issue_report',
  'citizen_issue_report',
  'system_alert',
  'dispatch_message',
  'truck_current_location',
  'truck_location_history',
] as const;

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
  const name = `tenancy_migration_${Date.now()}_${Math.floor(Math.random() * SCRATCH_NAME_RANDOM_RANGE)}`;
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

async function insertOrganization(pool: Pool, id: string): Promise<void> {
  await pool.query('INSERT INTO organization (id, name, slug) VALUES ($1, $1, $1)', [id]);
}

/** One row in each of the eleven tenant tables, in the schema as it was before tenancy. */
async function insertLegacyRows(pool: Pool, organizationId: string): Promise<void> {
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified", role) VALUES
       ('driver-1', 'Driver', 'driver@test.com', true, 'driver'),
       ('admin-1', 'Admin', 'admin@test.com', true, 'admin'),
       ('citizen-1', 'Citizen', 'citizen@test.com', true, 'user')`,
  );
  await pool.query(
    `INSERT INTO member (id, "userId", "organizationId", role) VALUES
       ('member-driver', 'driver-1', $1, 'driver'),
       ('member-admin', 'admin-1', $1, 'admin')`,
    [organizationId],
  );
  await pool.query(`INSERT INTO truck (id, name, license_plate) VALUES ('truck-1', 'Truck', 'ABC-123')`);
  await pool.query(
    `INSERT INTO route (id, name, start_lat, start_lng, estimated_duration_minutes, created_by)
     VALUES ('route-1', 'Route', -12.04, -77.04, 60, 'admin-1')`,
  );
  await pool.query(
    `INSERT INTO route_waypoint (id, route_id, sequence_order, lat, lng, estimated_arrival_offset_minutes)
     VALUES ('waypoint-1', 'route-1', 1, -12.04, -77.04, 5)`,
  );
  await pool.query(`INSERT INTO route_schedule (route_id, day_of_week, start_time) VALUES ('route-1', 1, '08:00')`);
  await pool.query(
    `INSERT INTO route_assignment (id, route_id, truck_id, driver_id, assigned_date, scheduled_start_time, scheduled_end_time, assigned_by)
     VALUES ('assignment-1', 'route-1', 'truck-1', 'driver-1', '2026-01-01', now(), now(), 'admin-1')`,
  );
  await pool.query(
    `INSERT INTO driver_issue_report (id, driver_id, route_assignment_id, type, lat, lng)
     VALUES ('driver-issue-1', 'driver-1', 'assignment-1', 'blocked', -12.04, -77.04)`,
  );
  await pool.query(
    `INSERT INTO citizen_issue_report (id, user_id, type, lat, lng)
     VALUES ('citizen-issue-1', 'citizen-1', 'overflow', -12.04, -77.04)`,
  );
  await pool.query(
    `INSERT INTO system_alert (id, type, message, truck_id, route_assignment_id)
     VALUES ('alert-1', 'late_start', 'late', 'truck-1', 'assignment-1')`,
  );
  await pool.query(
    `INSERT INTO dispatch_message (id, sender_id, recipient_id, content)
     VALUES ('message-1', 'admin-1', 'driver-1', 'hola')`,
  );
  await pool.query(
    `INSERT INTO truck_current_location (truck_id, route_assignment_id, lat, lng)
     VALUES ('truck-1', 'assignment-1', -12.04, -77.04)`,
  );
  await pool.query(
    `INSERT INTO truck_location_history (id, truck_id, route_assignment_id, lat, lng)
     VALUES ('history-1', 'truck-1', 'assignment-1', -12.04, -77.04)`,
  );
}

test('assigns every existing row to the only organization', async () => {
  const pool = await createScratchDatabase();

  try {
    await insertOrganization(pool, 'org-only');
    await insertLegacyRows(pool, 'org-only');

    await pool.query(readMigration(MIGRATION_UNDER_TEST));

    for (const table of TENANT_TABLES) {
      // biome-ignore lint/performance/noAwaitInLoops: eleven tiny reads; the failing table name matters more than speed.
      const { rows } = await pool.query<{ organizationId: string | null }>(
        `SELECT organization_id AS "organizationId" FROM "${table}"`,
      );
      expect({ table, organizationIds: rows.map((row) => row.organizationId) }).toEqual({
        table,
        organizationIds: ['org-only'],
      });
    }
  } finally {
    await pool.end();
  }
});

test('makes organization_id required everywhere except on citizen reports', async () => {
  const pool = await createScratchDatabase();

  try {
    await pool.query(readMigration(MIGRATION_UNDER_TEST));

    const { rows } = await pool.query<{ tableName: string; nullable: boolean }>(
      `SELECT table_name AS "tableName", is_nullable = 'YES' AS nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'organization_id' AND table_name = ANY($1)`,
      [[...TENANT_TABLES]],
    );

    expect(rows.map((row) => row.tableName).sort()).toEqual([...TENANT_TABLES].sort());
    expect(rows.filter((row) => row.nullable).map((row) => row.tableName)).toEqual(['citizen_issue_report']);
  } finally {
    await pool.end();
  }
});

test('aborts and changes nothing when rows exist and there is more than one organization', async () => {
  const pool = await createScratchDatabase();

  try {
    await insertOrganization(pool, 'org-a');
    await insertOrganization(pool, 'org-b');
    await insertLegacyRows(pool, 'org-a');

    await expect(pool.query(readMigration(MIGRATION_UNDER_TEST))).rejects.toThrow('found 2 organizations');

    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'truck' AND column_name = 'organization_id'`,
    );
    expect(rows).toHaveLength(0);
  } finally {
    await pool.end();
  }
});

test('aborts when rows exist and there is no organization', async () => {
  const pool = await createScratchDatabase();

  try {
    await pool.query(`INSERT INTO truck (id, name, license_plate) VALUES ('truck-1', 'Truck', 'ABC-123')`);

    await expect(pool.query(readMigration(MIGRATION_UNDER_TEST))).rejects.toThrow('found 0 organizations');
  } finally {
    await pool.end();
  }
});

test('applies to an empty database with any number of organizations', async () => {
  const pool = await createScratchDatabase();

  try {
    await insertOrganization(pool, 'org-a');
    await insertOrganization(pool, 'org-b');

    await pool.query(readMigration(MIGRATION_UNDER_TEST));

    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'truck' AND column_name = 'organization_id'`,
    );
    expect(rows).toHaveLength(1);
  } finally {
    await pool.end();
  }
});
