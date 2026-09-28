import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { HTTP_STATUS } from './config';
import { TestClient } from './helpers/client';
import { Database } from './helpers/database';
import { type Fixture, ids, type Person, Tenancy } from './helpers/tenancy';
import type { ErrorResponse, SuccessResponse } from './types';

interface Named {
  id: string;
  name: string;
}
interface Waypoint {
  id: string;
  lat: number;
}
interface IssueRow {
  id: string;
  source: string;
  description?: string;
}
interface Member {
  id: string;
  email: string;
}

/**
 * Two municipalities, A and B, each with an owner, a supervisor, a driver, a truck, a route and a
 * started assignment, plus one citizen who belongs to neither. For every staff route, staff of A
 * must not read or change anything of B.
 */
const client = new TestClient();
const db = new Database();
const tenancy = new Tenancy(client, db);

let fx: Fixture;

const ownerA = () => fx.a.owner;
const ownerB = () => fx.b.owner;

const list = <T>(path: string, as: Person) => tenancy.list<T>(path, as);
const descriptions = (rows: IssueRow[]) => rows.map((row) => row.description);

beforeAll(async () => {
  await db.clean();
  fx = await tenancy.createFixture();
});

afterAll(async () => {
  await db.close();
});

describe('GET /admin/trucks', () => {
  test('lists only the caller municipality trucks', async () => {
    expect(ids(await list<Named>('/admin/trucks', ownerA()))).toEqual([fx.a.truckId]);
    expect(ids(await list<Named>('/admin/trucks', ownerB()))).toEqual([fx.b.truckId]);
  });
});

describe('POST /admin/trucks', () => {
  test('creates a truck that only the caller municipality sees', async () => {
    const created = await client.post<SuccessResponse<Named>>(
      '/admin/trucks',
      { name: 'Truck A2', license_plate: 'PLATE-A2' },
      ownerA().headers,
    );
    expect(created.status).toBe(HTTP_STATUS.CREATED);

    expect(ids(await list<Named>('/admin/trucks', ownerA()))).toContain(created.data.data.id);
    expect(ids(await list<Named>('/admin/trucks', ownerB()))).not.toContain(created.data.data.id);
  });
});

describe('DELETE /admin/trucks/:id', () => {
  test('cannot deactivate a truck of another municipality', async () => {
    const response = await client.delete<ErrorResponse>(`/admin/trucks/${fx.b.truckId}`, ownerA().headers);

    expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    expect(ids(await list<Named>('/admin/trucks', ownerB()))).toContain(fx.b.truckId);
  });

  test('deactivates a truck of the caller municipality', async () => {
    const created = await client.post<SuccessResponse<Named>>(
      '/admin/trucks',
      { name: 'Truck A3', license_plate: 'PLATE-A3' },
      ownerA().headers,
    );

    const response = await client.delete(`/admin/trucks/${created.data.data.id}`, ownerA().headers);

    expect(response.status).toBe(204);
    expect(ids(await list<Named>('/admin/trucks', ownerA()))).not.toContain(created.data.data.id);
  });
});

describe('GET /admin/routes', () => {
  test('lists only the caller municipality routes', async () => {
    expect(ids(await list<Named>('/admin/routes', ownerA()))).toEqual([fx.a.routeId]);
    expect(ids(await list<Named>('/admin/routes', ownerB()))).toEqual([fx.b.routeId]);
  });
});

describe('POST /admin/routes', () => {
  test('creates a route that only the caller municipality sees', async () => {
    const created = await client.post<SuccessResponse<Named>>(
      '/admin/routes',
      {
        name: 'Route A2',
        start_lat: fx.a.center.lat,
        start_lng: fx.a.center.lng,
        estimated_duration_minutes: 60,
        waypoints: [{ lat: fx.a.center.lat, lng: fx.a.center.lng, sequence_order: 1 }],
      },
      ownerA().headers,
    );
    expect(created.status).toBe(HTTP_STATUS.CREATED);

    expect(ids(await list<Named>('/admin/routes', ownerA()))).toContain(created.data.data.id);
    expect(ids(await list<Named>('/admin/routes', ownerB()))).not.toContain(created.data.data.id);
  });
});

describe('GET /admin/routes/:id/waypoints', () => {
  test('returns the waypoints of a caller municipality route', async () => {
    const waypoints = await list<Waypoint>(`/admin/routes/${fx.a.routeId}/waypoints`, ownerA());

    expect(waypoints).toHaveLength(2);
  });

  test('does not return the waypoints of another municipality route', async () => {
    const response = await client.get<ErrorResponse>(`/admin/routes/${fx.b.routeId}/waypoints`, ownerA().headers);

    expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
  });
});

describe('POST /admin/assignments', () => {
  const start = () => new Date(Date.now() - 60_000).toISOString();
  const end = () => new Date(Date.now() + 3_600_000).toISOString();

  async function assign(route: string, truck: string, driver: string) {
    return client.post<ErrorResponse>(
      '/admin/assignments',
      { route_id: route, truck_id: truck, driver_id: driver, scheduled_start_time: start(), scheduled_end_time: end() },
      ownerA().headers,
    );
  }

  async function assignmentsMadeBy(userId: string): Promise<number> {
    const rows = await db.query('SELECT id FROM route_assignment WHERE assigned_by = $1', [userId]);
    return rows.length;
  }

  test('assigns a route, truck and driver of the caller municipality', async () => {
    const before = await assignmentsMadeBy(ownerA().id);

    const response = await assign(fx.a.routeId, fx.a.truckId, fx.a.driver.id);

    expect(response.status).toBe(HTTP_STATUS.CREATED);
    expect(await assignmentsMadeBy(ownerA().id)).toBe(before + 1);
  });

  test.each([
    ['a route', () => assign(fx.b.routeId, fx.a.truckId, fx.a.driver.id)],
    ['a truck', () => assign(fx.a.routeId, fx.b.truckId, fx.a.driver.id)],
    ['a driver', () => assign(fx.a.routeId, fx.a.truckId, fx.b.driver.id)],
  ])('rejects an assignment that uses %s of another municipality', async (_label, attempt) => {
    const before = await assignmentsMadeBy(ownerA().id);

    const response = await attempt();

    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(await assignmentsMadeBy(ownerA().id)).toBe(before);
  });
});

describe('GET /admin/issues and POST /admin/issues', () => {
  const at = () => fx.a.center;

  test('an issue the caller files is visible to its municipality only', async () => {
    await tenancy.report(ownerA(), '/admin/issues', { type: 'other', description: 'admin issue filed by A', ...at() });

    expect(descriptions(await list<IssueRow>('/admin/issues', ownerA()))).toContain('admin issue filed by A');
    expect(descriptions(await list<IssueRow>('/admin/issues', ownerB()))).not.toContain('admin issue filed by A');
  });

  test('a driver issue is visible to the municipality of its assignment only', async () => {
    await tenancy.report(fx.b.driver, '/driver/issues', {
      type: 'road_blocked',
      description: 'driver issue of B',
      ...fx.b.center,
    });

    expect(descriptions(await list<IssueRow>('/admin/issues', ownerB()))).toContain('driver issue of B');
    expect(descriptions(await list<IssueRow>('/admin/issues', ownerA()))).not.toContain('driver issue of B');
  });
});

describe('GET /admin/drivers, /admin/supervisors and staff writes', () => {
  test('lists only the caller municipality drivers and supervisors', async () => {
    expect(ids(await list<Member>('/admin/drivers', ownerA()))).toEqual([fx.a.driver.id]);
    expect(ids(await list<Member>('/admin/supervisors', ownerB()))).toEqual([fx.b.supervisor.id]);
  });

  test('a created user joins the caller municipality only', async () => {
    const response = await client.post<SuccessResponse<Member>>(
      '/admin/users',
      { name: 'New Driver', email: 'new-driver@tenancy.test', password: 'password-123', role: 'driver' },
      ownerA().headers,
    );
    expect(response.status).toBe(HTTP_STATUS.CREATED);

    expect(ids(await list<Member>('/admin/drivers', ownerA()))).toContain(response.data.data.id);
    expect(ids(await list<Member>('/admin/drivers', ownerB()))).not.toContain(response.data.data.id);
  });

  test('cannot edit a user of another municipality', async () => {
    const response = await client.patch<ErrorResponse>(
      `/admin/users/${fx.b.driver.id}`,
      { name: 'Renamed By A', email: fx.b.driver.email },
      ownerA().headers,
    );

    expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
  });
});

describe('driver routes', () => {
  test('a driver reads the assignment of their own municipality', async () => {
    const response = await client.get<SuccessResponse<{ id: string; waypoints: Waypoint[] }>>(
      '/driver/route/current',
      fx.a.driver.headers,
    );

    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(response.data.data.id).toBe(fx.a.assignmentId);
  });

  test.each(['start', 'complete'])('a driver cannot %s an assignment of another municipality', async (action) => {
    const response = await client.post<ErrorResponse>(
      `/driver/assignments/${fx.b.assignmentId}/${action}`,
      {},
      fx.a.driver.headers,
    );

    expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
  });

  test('a driver location update changes no truck of another municipality', async () => {
    const before = await list<Named>('/admin/trucks', ownerB());

    const response = await client.post(
      '/driver/location',
      { lat: fx.a.center.lat + 0.001, lng: fx.a.center.lng, speed: 10, heading: 0 },
      fx.a.driver.headers,
    );

    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(await list<Named>('/admin/trucks', ownerB())).toEqual(before);
    expect(ids(await list<Named>('/admin/trucks', ownerB()))).not.toContain(fx.a.truckId);
  });
});

describe('staff with two memberships', () => {
  test('the active organization decides which municipality they read', async () => {
    const both = await tenancy.createStaff(fx.a.organizationId, 'admin', 'both@tenancy.test');
    await tenancy.addMember(both.id, fx.b.organizationId, 'admin');

    // Both switches change the one session, so each read follows its own switch.
    const inA = await tenancy.switchTo(both, fx.a.organizationId);
    const truckIdsInA = ids(await list<Named>('/admin/trucks', inA));
    const inB = await tenancy.switchTo(both, fx.b.organizationId);
    const truckIdsInB = ids(await list<Named>('/admin/trucks', inB));

    expect(truckIdsInA).toContain(fx.a.truckId);
    expect(truckIdsInA).not.toContain(fx.b.truckId);
    expect(truckIdsInB).toContain(fx.b.truckId);
    expect(truckIdsInB).not.toContain(fx.a.truckId);
  });
});
