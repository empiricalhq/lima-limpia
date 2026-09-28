import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Database } from './helpers/database';

const FOREIGN_KEY_VIOLATION = '23503';
const NOT_NULL_VIOLATION = '23502';

/**
 * The API scopes every query, but the schema is the last line: a row must not be able to point at
 * a row of another municipality even if a query is wrong.
 */
const db = new Database();

async function code(statement: string, params: unknown[] = []): Promise<string | undefined> {
  try {
    await db.query(statement, params);
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

beforeAll(async () => {
  await db.clean();
  await db.query(`
    INSERT INTO organization (id, name, slug) VALUES ('org-a', 'A', 'a'), ('org-b', 'B', 'b');
    INSERT INTO "user" (id, name, email, role) VALUES
      ('user-a', 'A', 'a@schema.test', 'driver'),
      ('user-b', 'B', 'b@schema.test', 'driver');
    INSERT INTO member (id, "userId", "organizationId", role) VALUES
      ('member-a', 'user-a', 'org-a', 'driver'),
      ('member-b', 'user-b', 'org-b', 'driver');
    INSERT INTO truck (id, name, license_plate, organization_id) VALUES
      ('truck-a', 'A', 'SCHEMA-A', 'org-a'),
      ('truck-b', 'B', 'SCHEMA-B', 'org-b');
    INSERT INTO route (id, name, start_lat, start_lng, estimated_duration_minutes, created_by, organization_id) VALUES
      ('route-a', 'A', 0, 0, 60, 'user-a', 'org-a'),
      ('route-b', 'B', 0, 0, 60, 'user-b', 'org-b');
    INSERT INTO route_assignment
      (id, route_id, truck_id, driver_id, assigned_date, scheduled_start_time, scheduled_end_time, assigned_by, organization_id)
    VALUES
      ('assignment-a', 'route-a', 'truck-a', 'user-a', CURRENT_DATE, NOW(), NOW(), 'user-a', 'org-a'),
      ('assignment-b', 'route-b', 'truck-b', 'user-b', CURRENT_DATE, NOW(), NOW(), 'user-b', 'org-b');
  `);
});

afterAll(async () => {
  await db.close();
});

const ASSIGNMENT = `INSERT INTO route_assignment
  (id, route_id, truck_id, driver_id, assigned_date, scheduled_start_time, scheduled_end_time, assigned_by, organization_id)
  VALUES ($1, $2, $3, $4, CURRENT_DATE, NOW(), NOW(), 'user-a', 'org-a')`;

describe('route_assignment', () => {
  test.each([
    ['a route', ['route-b', 'truck-a', 'user-a']],
    ['a truck', ['route-a', 'truck-b', 'user-a']],
    ['a driver', ['route-a', 'truck-a', 'user-b']],
  ])('rejects %s of another organization', async (_label, refs) => {
    expect(await code(ASSIGNMENT, ['rejected', ...refs])).toBe(FOREIGN_KEY_VIOLATION);
  });

  test('accepts references inside one organization', async () => {
    expect(await code(ASSIGNMENT, ['accepted', 'route-a', 'truck-a', 'user-a'])).toBeUndefined();
  });

  test('requires an organization', async () => {
    const statement = `INSERT INTO route_assignment
      (id, route_id, truck_id, driver_id, assigned_date, scheduled_start_time, scheduled_end_time, assigned_by)
      VALUES ('no-org', 'route-a', 'truck-a', 'user-a', CURRENT_DATE, NOW(), NOW(), 'user-a')`;

    expect(await code(statement)).toBe(NOT_NULL_VIOLATION);
  });
});

describe('route children', () => {
  test('a waypoint cannot sit under a route of another organization', async () => {
    const statement = `INSERT INTO route_waypoint
      (id, route_id, sequence_order, lat, lng, estimated_arrival_offset_minutes, organization_id)
      VALUES ('waypoint', 'route-b', 1, 0, 0, 0, 'org-a')`;

    expect(await code(statement)).toBe(FOREIGN_KEY_VIOLATION);
  });

  test('a schedule cannot sit under a route of another organization', async () => {
    const statement = `INSERT INTO route_schedule (route_id, day_of_week, start_time, organization_id)
      VALUES ('route-b', 1, '08:00', 'org-a')`;

    expect(await code(statement)).toBe(FOREIGN_KEY_VIOLATION);
  });
});

describe('truck locations', () => {
  test('a current location cannot describe a truck of another organization', async () => {
    const statement = `INSERT INTO truck_current_location (truck_id, lat, lng, organization_id)
      VALUES ('truck-b', 0, 0, 'org-a')`;

    expect(await code(statement)).toBe(FOREIGN_KEY_VIOLATION);
  });

  test('a history row cannot describe a truck of another organization', async () => {
    const statement = `INSERT INTO truck_location_history (id, truck_id, lat, lng, organization_id)
      VALUES ('history', 'truck-b', 0, 0, 'org-a')`;

    expect(await code(statement)).toBe(FOREIGN_KEY_VIOLATION);
  });
});

describe('truck_current_location assignment', () => {
  const LOCATION = `INSERT INTO truck_current_location (truck_id, lat, lng, organization_id, route_assignment_id)
    VALUES ('truck-a', 0, 0, 'org-a', $1)`;

  test('cannot reference an assignment of another organization', async () => {
    expect(await code(LOCATION, ['assignment-b'])).toBe(FOREIGN_KEY_VIOLATION);
  });

  test('accepts an assignment of its own organization or none', async () => {
    await db.query(`DELETE FROM truck_current_location WHERE truck_id = 'truck-a'`);
    expect(await code(LOCATION, ['assignment-a'])).toBeUndefined();
    await db.query(`DELETE FROM truck_current_location WHERE truck_id = 'truck-a'`);
    expect(await code(LOCATION, [null])).toBeUndefined();
  });

  test('an assignment with a current location cannot be deleted', async () => {
    await db.query(`DELETE FROM truck_current_location WHERE truck_id = 'truck-a'`);
    await db.query(`INSERT INTO route_assignment
      (id, route_id, truck_id, driver_id, assigned_date, scheduled_start_time, scheduled_end_time, assigned_by, organization_id)
      VALUES ('assignment-held', 'route-a', 'truck-a', 'user-a', CURRENT_DATE, NOW(), NOW(), 'user-a', 'org-a')`);
    await db.query(LOCATION, ['assignment-held']);

    expect(await code(`DELETE FROM route_assignment WHERE id = 'assignment-held'`)).toBe(FOREIGN_KEY_VIOLATION);
  });
});

describe('system_alert', () => {
  const ALERT = `INSERT INTO system_alert (id, type, message, organization_id, route_assignment_id, truck_id)
    VALUES ($1, 'late_start', 'm', 'org-a', $2, $3)`;

  test.each([
    ['an assignment', ['assignment-b', null]],
    ['a truck', [null, 'truck-b']],
  ])('cannot reference %s of another organization', async (label, refs) => {
    expect(await code(ALERT, [`rejected-${label}`, ...refs])).toBe(FOREIGN_KEY_VIOLATION);
  });

  test('accepts references inside its organization, or none', async () => {
    expect(await code(ALERT, ['own', 'assignment-a', 'truck-a'])).toBeUndefined();
    expect(await code(ALERT, ['none', null, null])).toBeUndefined();
  });
});

describe('driver_issue_report', () => {
  test('cannot reference an assignment of another organization', async () => {
    const statement = `INSERT INTO driver_issue_report (id, driver_id, route_assignment_id, type, lat, lng, organization_id)
      VALUES ('issue', 'user-b', 'assignment-a', 'other', 0, 0, 'org-b')`;

    expect(await code(statement)).toBe(FOREIGN_KEY_VIOLATION);
  });
});

describe('dispatch_message', () => {
  test('sender and recipient must be members of the message organization', async () => {
    const statement = `INSERT INTO dispatch_message (id, sender_id, recipient_id, content, organization_id)
      VALUES ('message', 'user-a', 'user-b', 'hello', 'org-a')`;

    expect(await code(statement)).toBe(FOREIGN_KEY_VIOLATION);
  });
});

describe('citizen_issue_report', () => {
  test('may have no organization', async () => {
    await db.query(`INSERT INTO "user" (id, name, email, role) VALUES ('citizen', 'C', 'c@schema.test', 'citizen')`);
    const statement = `INSERT INTO citizen_issue_report (id, user_id, type, lat, lng) VALUES ('unowned', 'citizen', 'other', 0, 0)`;

    expect(await code(statement)).toBeUndefined();
  });
});
