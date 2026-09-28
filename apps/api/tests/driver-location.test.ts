import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { PoolClient } from 'pg';
import { AssignmentRepository } from '@/internal/domains/assignments/repository';
import { DriverService } from '@/internal/domains/driver/service';
import { IssueRepository } from '@/internal/domains/issues/repository';
import { LocationRepository } from '@/internal/domains/locations/repository';
import { RouteRepository } from '@/internal/domains/routes/repository';
import { loadConfig } from '@/internal/shared/config/config';
import { Database } from '@/internal/shared/database/database';
import { organizationScope } from '@/internal/shared/tenancy/scope';
import { Database as TestDatabase } from './helpers/database';

/**
 * Drives `DriverService.updateLocation` in-process against the real test database. The HTTP suite
 * can neither make one statement of the transaction fail nor see how the service uses its client,
 * and both are what this file checks.
 */

/**
 * Runs every query on the real pool and counts the ones issued while the same client was still
 * running another. pg@8 queues them silently; pg@9 removes that.
 */
class OverlapCountingDatabase extends Database {
  overlappingQueries = 0;

  override async getClient(): Promise<PoolClient> {
    const client = await super.getClient();
    const query = client.query.bind(client) as (...args: unknown[]) => Promise<unknown>;
    let inFlight = 0;
    client.query = ((...args: unknown[]) => {
      // The pool's own callback-style calls return no promise and are not the service's.
      if (typeof args.at(-1) === 'function') {
        return query(...args);
      }
      if (inFlight > 0) {
        this.overlappingQueries += 1;
      }
      inFlight += 1;
      const pending = query(...args);
      const settled = () => {
        inFlight -= 1;
      };
      pending.then(settled, settled);
      return pending;
    }) as PoolClient['query'];
    return client;
  }
}

const COMPLETION_GRACE_MS = 250;

/**
 * Makes `database` start `complete` on another connection once a statement has read the assignment
 * as active, whether that statement ran on the pool or on a client. A completion that has to wait
 * for the reader's transaction is given a moment, then left running.
 */
function completeAfterActiveRead(database: Database, complete: () => Promise<unknown>) {
  const race: { completion: Promise<unknown> | null } = { completion: null };

  async function afterRead(text: string): Promise<void> {
    const readsActiveAssignment = text.includes('FROM route_assignment') && text.includes("status = 'active'");
    if (!readsActiveAssignment || race.completion) {
      return;
    }
    race.completion = complete();
    await Promise.race([race.completion, Bun.sleep(COMPLETION_GRACE_MS)]);
  }

  const poolQuery = database.query.bind(database);
  database.query = (async (text: string, params?: unknown[]) => {
    const result = await poolQuery(text, params);
    await afterRead(text);
    return result;
  }) as Database['query'];

  const getClient = database.getClient.bind(database);
  database.getClient = async () => {
    const client = await getClient();
    const clientQuery = client.query.bind(client) as (...args: unknown[]) => Promise<unknown>;
    client.query = (async (...args: unknown[]) => {
      const result = await clientQuery(...args);
      if (typeof args[0] === 'string') {
        await afterRead(args[0]);
      }
      return result;
    }) as PoolClient['query'];
    return client;
  };

  return race;
}

const db = new OverlapCountingDatabase(loadConfig().database);
const testDb = new TestDatabase();
const driverService = new DriverService({
  assignmentRepo: new AssignmentRepository(db),
  routeRepo: new RouteRepository(db),
  issueRepo: new IssueRepository(db),
  locationRepo: new LocationRepository(db),
});

const racingDb = new Database(loadConfig().database);
const race = completeAfterActiveRead(racingDb, () =>
  db.query(`UPDATE route_assignment SET status = 'completed', actual_end_time = NOW() WHERE id = $1`, [ASSIGNMENT_ID]),
);
const racingService = new DriverService({
  assignmentRepo: new AssignmentRepository(racingDb),
  routeRepo: new RouteRepository(racingDb),
  issueRepo: new IssueRepository(racingDb),
  locationRepo: new LocationRepository(racingDb),
});

const ORGANIZATION_ID = 'driver-location-organization';
const SCOPE = organizationScope(ORGANIZATION_ID);
const DRIVER_ID = 'driver-location-user';
const TRUCK_ID = 'driver-location-truck';
const ASSIGNMENT_ID = 'driver-location-assignment';
const PREVIOUS = { lat: -12.0, lng: -77.0 };
const UPDATE = { lat: -12.0464, lng: -77.0428, speed: 30, heading: 90 };

async function failInserts(table: string, message: string): Promise<void> {
  await db.query(`
    CREATE FUNCTION reject_${table}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION '${message}'; END $$
  `);
  await db.query(
    `CREATE TRIGGER reject_${table} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION reject_${table}()`,
  );
}

async function dropRejection(table: string): Promise<void> {
  await db.query(`DROP TRIGGER IF EXISTS reject_${table} ON ${table}`);
  await db.query(`DROP FUNCTION IF EXISTS reject_${table}()`);
}

async function updateLocationError(): Promise<Error> {
  try {
    await driverService.updateLocation(SCOPE, DRIVER_ID, UPDATE);
  } catch (error) {
    return error as Error;
  }
  throw new Error('updateLocation was expected to fail.');
}

async function currentLocation() {
  const { rows } = await db.query<{ lat: number; lng: number; speed: number | null }>(
    'SELECT lat, lng, speed FROM truck_current_location WHERE truck_id = $1',
    [TRUCK_ID],
  );
  return rows;
}

async function historyCount(): Promise<number> {
  const { rows } = await db.query('SELECT id FROM truck_location_history WHERE truck_id = $1', [TRUCK_ID]);
  return rows.length;
}

beforeEach(async () => {
  db.overlappingQueries = 0;
  race.completion = null;
  await testDb.clean();
  await db.query(
    `INSERT INTO "user" (id, name, email, role) VALUES ($1, 'Driver', 'driver-location@test.com', 'user')`,
    [DRIVER_ID],
  );
  await db.query(`INSERT INTO organization (id, name, slug) VALUES ($1, 'Municipality', 'driver-location-org')`, [
    ORGANIZATION_ID,
  ]);
  await db.query(
    `INSERT INTO member (id, "userId", "organizationId", role) VALUES ('driver-location-member', $1, $2, 'driver')`,
    [DRIVER_ID, ORGANIZATION_ID],
  );
  await db.query(`INSERT INTO truck (id, organization_id, name, license_plate) VALUES ($1, $2, 'Truck', 'LOC-001')`, [
    TRUCK_ID,
    ORGANIZATION_ID,
  ]);
  await db.query(
    `INSERT INTO route (id, organization_id, name, start_lat, start_lng, estimated_duration_minutes, created_by)
     VALUES ('driver-location-route', $2, 'Route', 0, 0, 60, $1)`,
    [DRIVER_ID, ORGANIZATION_ID],
  );
  await db.query(
    `INSERT INTO route_assignment
       (id, organization_id, route_id, truck_id, driver_id, assigned_date, scheduled_start_time, scheduled_end_time, status, assigned_by)
     VALUES ($1, $4, 'driver-location-route', $2, $3, CURRENT_DATE, NOW(), NOW() + INTERVAL '1 hour', 'active', $3)`,
    [ASSIGNMENT_ID, TRUCK_ID, DRIVER_ID, ORGANIZATION_ID],
  );
  await db.query(
    'INSERT INTO truck_current_location (truck_id, organization_id, route_assignment_id, lat, lng) VALUES ($1, $5, $2, $3, $4)',
    [TRUCK_ID, ASSIGNMENT_ID, PREVIOUS.lat, PREVIOUS.lng, ORGANIZATION_ID],
  );
});

afterEach(async () => {
  await dropRejection('truck_location_history');
  await dropRejection('truck_current_location');
});

afterAll(async () => {
  await db.close();
  await racingDb.close();
  await testDb.close();
});

describe('DriverService.updateLocation', () => {
  test('writes the current location and one history row', async () => {
    await driverService.updateLocation(SCOPE, DRIVER_ID, UPDATE);

    expect(await currentLocation()).toEqual([{ lat: UPDATE.lat, lng: UPDATE.lng, speed: UPDATE.speed }]);
    expect(await historyCount()).toBe(1);
  });

  test('rejects the update and writes nothing when the driver has no active assignment', async () => {
    await db.query(`UPDATE route_assignment SET status = 'completed' WHERE id = $1`, [ASSIGNMENT_ID]);

    const error = await updateLocationError();

    expect(error.message).toContain('No active assignment');
    expect(await currentLocation()).toEqual([{ lat: PREVIOUS.lat, lng: PREVIOUS.lng, speed: null }]);
    expect(await historyCount()).toBe(0);
  });

  test('never queries a pg client that is still running a query', async () => {
    await driverService.updateLocation(SCOPE, DRIVER_ID, UPDATE);

    expect(db.overlappingQueries).toBe(0);
  });

  test('rolls the current location back and surfaces the history error when the history insert fails', async () => {
    await failInserts('truck_location_history', 'history insert rejected');

    const error = await updateLocationError();

    expect(error.message).toContain('history insert rejected');
    expect(await currentLocation()).toEqual([{ lat: PREVIOUS.lat, lng: PREVIOUS.lng, speed: null }]);
    expect(await historyCount()).toBe(0);
  });

  test('surfaces the current-location error, not an aborted transaction, when that write fails first', async () => {
    await failInserts('truck_current_location', 'current location rejected');

    const error = await updateLocationError();

    expect(error.message).toContain('current location rejected');
    expect(error.message).not.toContain('current transaction is aborted');
    expect(await currentLocation()).toEqual([{ lat: PREVIOUS.lat, lng: PREVIOUS.lng, speed: null }]);
    expect(await historyCount()).toBe(0);
  });
});

describe('DriverService.updateLocation while the assignment completes', () => {
  test('records no location after the assignment ended', async () => {
    await racingService.updateLocation(SCOPE, DRIVER_ID, UPDATE);
    await race.completion;

    const { rows } = await db.query<{ status: string; late: number }>(
      `SELECT ra.status, COUNT(h.id) FILTER (WHERE h.recorded_at > ra.actual_end_time)::int AS late
       FROM route_assignment ra
       LEFT JOIN truck_location_history h ON h.route_assignment_id = ra.id
       WHERE ra.id = $1
       GROUP BY ra.id`,
      [ASSIGNMENT_ID],
    );
    expect(rows).toEqual([{ status: 'completed', late: 0 }]);
  });
});
