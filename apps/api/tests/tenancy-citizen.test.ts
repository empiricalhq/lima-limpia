import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { HTTP_STATUS } from './config';
import { TestClient } from './helpers/client';
import { Database } from './helpers/database';
import { type Fixture, Tenancy } from './helpers/tenancy';
import type { SuccessResponse } from './types';

interface CitizenTruck {
  id: string;
  lat: number | null;
  lng: number | null;
}
interface IssueRow {
  description?: string;
}

/**
 * Citizens belong to no municipality: they see every municipality's trucks, and a report they
 * file reaches the municipality whose active route passes nearest to it.
 */
const client = new TestClient();
const db = new Database();
const tenancy = new Tenancy(client, db);

let fx: Fixture;

const descriptions = (rows: IssueRow[]) => rows.map((row) => row.description);

beforeAll(async () => {
  await db.clean();
  fx = await tenancy.createFixture();
});

afterAll(async () => {
  await db.close();
});

describe('citizen trucks', () => {
  test('sees the active trucks and live locations of every municipality', async () => {
    const trucks = await tenancy.list<CitizenTruck>('/citizen/trucks', fx.citizen);

    const byId = new Map(trucks.map((truck) => [truck.id, truck]));
    expect(byId.get(fx.a.truckId)?.lat).not.toBeNull();
    expect(byId.get(fx.b.truckId)?.lat).not.toBeNull();
  });

  test('does not receive driver names', async () => {
    const trucks = await tenancy.list<CitizenTruck>('/citizen/trucks', fx.citizen);

    for (const truck of trucks) {
      expect(truck).not.toHaveProperty('driver_name');
    }
  });

  test('finds a nearby truck of a municipality that has no staff relation to them', async () => {
    await client.put('/citizen/profile/location', fx.b.center, fx.citizen.headers);

    const response = await client.get<SuccessResponse<{ status: string; truckId?: string }>>(
      '/citizen/truck/status',
      fx.citizen.headers,
    );

    expect(response.data.data).toMatchObject({ status: 'NEARBY', truckId: fx.b.truckId });
  });

  test('is not staff of any municipality', async () => {
    const statuses = await Promise.all(
      ['/admin/trucks', '/admin/routes', '/admin/issues'].map(async (path) => {
        const response = await client.get(path, fx.citizen.headers);
        return response.status;
      }),
    );

    expect(statuses).toEqual([HTTP_STATUS.FORBIDDEN, HTTP_STATUS.FORBIDDEN, HTTP_STATUS.FORBIDDEN]);
  });
});

describe('citizen issue reports', () => {
  const nearA = () => ({ lat: fx.a.center.lat + 0.002, lng: fx.a.center.lng });
  const nearB = () => ({ lat: fx.b.center.lat - 0.002, lng: fx.b.center.lng });
  const farFromBoth = { lat: -12.3, lng: -76.9 };

  test('a report goes to the municipality with the nearest active route', async () => {
    await tenancy.report(fx.citizen, '/citizen/issues', {
      type: 'missed_collection',
      description: 'reported near A',
      ...nearA(),
    });
    await tenancy.report(fx.citizen, '/citizen/issues', {
      type: 'illegal_dumping',
      description: 'reported near B',
      ...nearB(),
    });

    const seenByA = descriptions(await tenancy.list<IssueRow>('/admin/issues', fx.a.owner));
    const seenByB = descriptions(await tenancy.list<IssueRow>('/admin/issues', fx.b.owner));

    expect(seenByA).toContain('reported near A');
    expect(seenByA).not.toContain('reported near B');
    expect(seenByB).toContain('reported near B');
    expect(seenByB).not.toContain('reported near A');
  });

  test('a report far from every route belongs to no municipality', async () => {
    await tenancy.report(fx.citizen, '/citizen/issues', {
      type: 'other',
      description: 'reported far away',
      ...farFromBoth,
    });

    expect(descriptions(await tenancy.list<IssueRow>('/admin/issues', fx.a.owner))).not.toContain('reported far away');
    expect(descriptions(await tenancy.list<IssueRow>('/admin/issues', fx.b.owner))).not.toContain('reported far away');
    const rows = await db.query<{ organization_id: string | null }>(
      `SELECT organization_id FROM citizen_issue_report WHERE description = 'reported far away'`,
    );
    expect(rows).toEqual([{ organization_id: null }]);
  });

  test('a report is stored with the municipality that received it', async () => {
    await tenancy.report(fx.citizen, '/citizen/issues', { type: 'other', description: 'stored with A', ...nearA() });

    const rows = await db.query<{ organization_id: string }>(
      `SELECT organization_id FROM citizen_issue_report WHERE description = 'stored with A'`,
    );
    expect(rows).toEqual([{ organization_id: fx.a.organizationId }]);
  });

  test('the citizen lists every report they filed, whichever municipality received it', async () => {
    await tenancy.report(fx.citizen, '/citizen/issues', {
      type: 'other',
      description: 'mine, received by B',
      ...nearB(),
    });
    await tenancy.report(fx.citizen, '/citizen/issues', {
      type: 'other',
      description: 'mine, received by nobody',
      ...farFromBoth,
    });

    const mine = descriptions(await tenancy.list<IssueRow>('/citizen/issues', fx.citizen));

    expect(mine).toContain('mine, received by B');
    expect(mine).toContain('mine, received by nobody');
  });
});
