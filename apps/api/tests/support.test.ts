// biome-ignore-all lint/style/noExcessiveLinesPerFile: one cohesive suite for the support role and impersonation.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createAppAuth } from '@lima-garbage/database';
import { Pool } from 'pg';
import { HTTP_STATUS } from './config';
import { TestClient } from './helpers/client';
import { Database } from './helpers/database';
import { type Fixture, ids, type Person, Tenancy } from './helpers/tenancy';
import type { ErrorResponse, SuccessResponse } from './types';

const UNAUTHORIZED = 401;

interface Named {
  id: string;
  name: string;
}
interface Organization {
  id: string;
  slug: string;
}
interface Issue {
  description?: string;
}
interface Member {
  id: string;
  role: string;
}
interface AuditRow {
  action: string;
  impersonator_id: string;
  impersonated_user_id: string;
  organization_id: string | null;
  session_id: string;
  method: string | null;
  path: string | null;
  status_code: number | null;
}

/**
 * Two municipalities, A and B, and one platform support user. Support reads both and changes
 * nothing except through an impersonated session, which expires and leaves an audit row.
 */
const client = new TestClient();
const db = new Database();
const tenancy = new Tenancy(client, db);

let fx: Fixture;
let support: Person;

const owner = () => fx.a.owner;
const auditRows = () =>
  db.query<AuditRow>(
    `SELECT action, impersonator_id, impersonated_user_id, organization_id, session_id, method, path, status_code
     FROM support_audit ORDER BY created_at, id`,
  );

/** Every cookie the response set, as a request header. A cookie set with an empty value is a deletion. */
function cookieHeader(headers: Headers): string {
  const cookies = new Map<string, string>();
  for (const line of headers.getSetCookie()) {
    const [pair = ''] = line.split(';');
    const separator = pair.indexOf('=');
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (value) {
      cookies.set(name, value);
    } else {
      cookies.delete(name);
    }
  }
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function impersonate(as: Person, userId: string, organizationId?: string): Promise<Person> {
  const response = await client.post<SuccessResponse<unknown>>(
    '/support/impersonate',
    { userId, organizationId },
    as.headers,
  );
  if (response.status !== HTTP_STATUS.OK) {
    throw new Error(`Impersonating ${userId} failed with ${response.status}`);
  }
  return { id: userId, email: '', headers: { Cookie: cookieHeader(response.headers) } };
}

async function impersonatedSessionId(userId: string): Promise<string> {
  const rows = await db.query<{ id: string }>(
    `SELECT id FROM session WHERE "userId" = $1 AND "impersonatedBy" IS NOT NULL ORDER BY "createdAt" DESC LIMIT 1`,
    [userId],
  );
  const id = rows[0]?.id;
  if (!id) {
    throw new Error(`No impersonated session for ${userId}`);
  }
  return id;
}

beforeAll(async () => {
  await db.clean();
  fx = await tenancy.createFixture();
  support = await tenancy.createSupport('support@tenancy.test');
});

afterAll(async () => {
  await db.close();
});

describe('a support user reads every municipality', () => {
  test('lists the municipalities', async () => {
    const organizations = await tenancy.list<Organization>('/support/organizations', support);

    expect(ids(organizations).sort()).toEqual([fx.a.organizationId, fx.b.organizationId].sort());
  });

  test('reads the trucks, routes and drivers of A and of B', async () => {
    await Promise.all(
      [fx.a, fx.b].map(async (municipality) => {
        const base = `/support/organizations/${municipality.organizationId}`;

        expect(ids(await tenancy.list<Named>(`${base}/trucks`, support))).toEqual([municipality.truckId]);
        expect(ids(await tenancy.list<Named>(`${base}/routes`, support))).toEqual([municipality.routeId]);
        expect(ids(await tenancy.list<Named>(`${base}/drivers`, support))).toEqual([municipality.driver.id]);
        expect(ids(await tenancy.list<Named>(`${base}/supervisors`, support))).toEqual([municipality.supervisor.id]);
      }),
    );
  });

  test('lists every member of a municipality with the role that decides who it can impersonate', async () => {
    const members = await tenancy.list<Member>(`/support/organizations/${fx.a.organizationId}/members`, support);

    expect(members.map((member) => `${member.id}:${member.role}`).sort()).toEqual(
      [`${fx.a.owner.id}:owner`, `${fx.a.supervisor.id}:supervisor`, `${fx.a.driver.id}:driver`].sort(),
    );
  });

  test('reads the open issues of one municipality and the reports no municipality owns', async () => {
    await tenancy.report(fx.a.driver, '/driver/issues', {
      type: 'mechanical_failure',
      description: 'driver report in A',
      lat: fx.a.center.lat,
      lng: fx.a.center.lng,
    });
    await tenancy.report(fx.citizen, '/citizen/issues', {
      type: 'other',
      description: 'citizen report far from both',
      lat: 0,
      lng: 0,
    });

    const inA = await tenancy.list<Issue>(`/support/organizations/${fx.a.organizationId}/issues`, support);
    const inB = await tenancy.list<Issue>(`/support/organizations/${fx.b.organizationId}/issues`, support);
    const unassigned = await tenancy.list<Issue>('/support/issues/unassigned', support);

    expect(inA.map((issue) => issue.description)).toContain('driver report in A');
    expect(inB.map((issue) => issue.description)).not.toContain('driver report in A');
    expect(unassigned.map((issue) => issue.description)).toEqual(['citizen report far from both']);
  });

  test('finds a citizen by email', async () => {
    const found = await tenancy.list<Named>(`/support/citizens?email=${encodeURIComponent(fx.citizen.email)}`, support);

    expect(ids(found)).toEqual([fx.citizen.id]);
  });

  test('an unknown municipality reads as missing', async () => {
    const response = await client.get<ErrorResponse>(
      '/support/organizations/no-such-organization/trucks',
      support.headers,
    );

    expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
  });

  test('a municipality owner, a driver and a citizen cannot read through the support routes', async () => {
    const responses = await Promise.all(
      [owner(), fx.a.driver, fx.citizen].map((person) => client.get('/support/organizations', person.headers)),
    );

    expect(responses.map((response) => response.status)).toEqual([
      HTTP_STATUS.FORBIDDEN,
      HTTP_STATUS.FORBIDDEN,
      HTTP_STATUS.FORBIDDEN,
    ]);
    expect((await client.get('/support/organizations')).status).toBe(UNAUTHORIZED);
  });

  test('the support routes offer no way to write municipality data', async () => {
    const base = `/support/organizations/${fx.a.organizationId}`;

    expect((await client.post(`${base}/trucks`, { name: 'x', license_plate: 'x' }, support.headers)).status).toBe(
      HTTP_STATUS.NOT_FOUND,
    );
    expect((await client.delete(`${base}/trucks/${fx.a.truckId}`, support.headers)).status).toBe(HTTP_STATUS.NOT_FOUND);
    expect(ids(await tenancy.list<Named>(`${base}/trucks`, support))).toEqual([fx.a.truckId]);
  });
});

describe('a support user cannot write without impersonating', () => {
  test('staff routes refuse the session', async () => {
    const truck = await client.post('/admin/trucks', { name: 'Truck S', license_plate: 'PLATE-S' }, support.headers);
    const user = await client.post(
      '/admin/users',
      { name: 'Somebody', email: 'somebody@tenancy.test', password: 'somebody-password-1', role: 'driver' },
      support.headers,
    );
    const location = await client.post('/driver/location', { lat: 1, lng: 1, speed: 1, heading: 1 }, support.headers);

    expect([truck.status, user.status, location.status]).toEqual([
      HTTP_STATUS.FORBIDDEN,
      HTTP_STATUS.FORBIDDEN,
      HTTP_STATUS.FORBIDDEN,
    ]);
    expect(await db.query(`SELECT 1 FROM truck WHERE name = 'Truck S'`)).toEqual([]);
  });

  test('citizen routes refuse the session, though it has no municipality', async () => {
    const report = await client.post(
      '/citizen/issues',
      { type: 'other', description: 'filed by support', lat: 0, lng: 0 },
      support.headers,
    );
    const location = await client.put('/citizen/profile/location', { lat: 1, lng: 1 }, support.headers);

    expect([report.status, location.status]).toEqual([HTTP_STATUS.FORBIDDEN, HTTP_STATUS.FORBIDDEN]);
    expect(await db.query(`SELECT 1 FROM citizen_issue_report WHERE description = 'filed by support'`)).toEqual([]);
  });

  test('no municipality can be made active', async () => {
    const response = await client.post(
      '/auth/organization/set-active',
      { organizationId: fx.a.organizationId },
      support.headers,
    );

    expect(response.status).not.toBe(HTTP_STATUS.OK);
  });
});

describe('an impersonated session', () => {
  test('writes inside the impersonated municipality only, and the audit row names the impersonator', async () => {
    const asOwner = await impersonate(support, owner().id);

    const created = await client.post<SuccessResponse<Named>>(
      '/admin/trucks',
      { name: 'Truck by support', license_plate: 'SUP-0001' },
      asOwner.headers,
    );
    expect(created.status).toBe(HTTP_STATUS.CREATED);

    const [row] = await db.query<{ organization_id: string }>('SELECT organization_id FROM truck WHERE id = $1', [
      created.data.data.id,
    ]);
    expect(row?.organization_id).toBe(fx.a.organizationId);
    expect(ids(await tenancy.list<Named>('/admin/trucks', fx.b.owner))).not.toContain(created.data.data.id);

    const foreign = await client.delete<ErrorResponse>(`/admin/trucks/${fx.b.truckId}`, asOwner.headers);
    expect(foreign.status).toBe(HTTP_STATUS.NOT_FOUND);
    expect(ids(await tenancy.list<Named>('/admin/trucks', fx.b.owner))).toContain(fx.b.truckId);

    const writes = (await auditRows()).filter((entry) => entry.action === 'write');
    const sessionId = await impersonatedSessionId(owner().id);
    expect(writes).toContainEqual({
      action: 'write',
      impersonator_id: support.id,
      impersonated_user_id: owner().id,
      organization_id: fx.a.organizationId,
      session_id: sessionId,
      method: 'POST',
      path: '/api/admin/trucks',
      status_code: HTTP_STATUS.CREATED,
    });
    expect(writes).toContainEqual({
      action: 'write',
      impersonator_id: support.id,
      impersonated_user_id: owner().id,
      organization_id: fx.a.organizationId,
      session_id: sessionId,
      method: 'DELETE',
      path: '/api/admin/trucks/:id',
      status_code: HTTP_STATUS.NOT_FOUND,
    });
  });

  test('the start of an impersonation is recorded', async () => {
    const before = (await auditRows()).filter((entry) => entry.action === 'impersonation.start').length;

    await impersonate(support, fx.b.supervisor.id);

    const starts = (await auditRows()).filter((entry) => entry.action === 'impersonation.start');
    expect(starts).toHaveLength(before + 1);
    expect(starts.at(-1)).toMatchObject({
      impersonator_id: support.id,
      impersonated_user_id: fx.b.supervisor.id,
      organization_id: fx.b.organizationId,
      session_id: await impersonatedSessionId(fx.b.supervisor.id),
    });
  });

  test('reads leave no audit row', async () => {
    const asOwner = await impersonate(support, owner().id);
    const before = (await auditRows()).length;

    const trucks = await client.get('/admin/trucks', asOwner.headers);

    expect(trucks.status).toBe(HTTP_STATUS.OK);
    expect(await auditRows()).toHaveLength(before);
  });

  test('a write is refused when its audit row cannot be written', async () => {
    const asOwner = await impersonate(support, owner().id);

    await db.query('ALTER TABLE support_audit RENAME TO support_audit_hidden');
    try {
      const response = await client.post(
        '/admin/trucks',
        { name: 'Unaudited truck', license_plate: 'UNAUD-01' },
        asOwner.headers,
      );

      expect(response.status).toBeGreaterThanOrEqual(500);
    } finally {
      await db.query('ALTER TABLE support_audit_hidden RENAME TO support_audit');
    }
    expect(await db.query(`SELECT 1 FROM truck WHERE name = 'Unaudited truck'`)).toEqual([]);
  });

  test('a citizen can be impersonated, and the audit row has no municipality', async () => {
    const asCitizen = await impersonate(support, fx.citizen.id);

    const response = await client.post(
      '/citizen/issues',
      { type: 'other', description: 'filed while impersonating', lat: 0, lng: 0 },
      asCitizen.headers,
    );

    expect(response.status).toBe(HTTP_STATUS.CREATED);
    const writes = (await auditRows()).filter(
      (entry) => entry.action === 'write' && entry.impersonated_user_id === fx.citizen.id,
    );
    expect(writes).toContainEqual(
      expect.objectContaining({
        impersonator_id: support.id,
        organization_id: null,
        method: 'POST',
        path: '/api/citizen/issues',
      }),
    );
  });

  test('a user of two municipalities needs one named, and works in that one', async () => {
    const both = await tenancy.createStaff(fx.a.organizationId, 'supervisor', 'both@tenancy.test');
    await tenancy.addMember(both.id, fx.b.organizationId, 'supervisor');

    const unnamed = await client.post<ErrorResponse>('/support/impersonate', { userId: both.id }, support.headers);
    expect(unnamed.status).toBe(HTTP_STATUS.BAD_REQUEST);

    const notTheirs = await client.post<ErrorResponse>(
      '/support/impersonate',
      { userId: both.id, organizationId: 'no-such-organization' },
      support.headers,
    );
    expect(notTheirs.status).toBe(HTTP_STATUS.BAD_REQUEST);

    const inB = await impersonate(support, both.id, fx.b.organizationId);
    expect(ids(await tenancy.list<Named>('/admin/trucks', inB))).toEqual([fx.b.truckId]);
  });

  test("cannot move to another of the impersonated user's municipalities", async () => {
    const both = await tenancy.createStaff(fx.a.organizationId, 'supervisor', 'switcher@tenancy.test');
    await tenancy.addMember(both.id, fx.b.organizationId, 'supervisor');
    const inA = await impersonate(support, both.id, fx.a.organizationId);

    const switched = await client.post<ErrorResponse>(
      '/auth/organization/set-active',
      { organizationId: fx.b.organizationId },
      inA.headers,
    );

    expect(switched.status).toBe(HTTP_STATUS.FORBIDDEN);
    const trucks = ids(await tenancy.list<Named>('/admin/trucks', inA));
    expect(trucks).toContain(fx.a.truckId);
    expect(trucks).not.toContain(fx.b.truckId);
    const [row] = await db.query<{ activeOrganizationId: string }>(
      `SELECT "activeOrganizationId" FROM session WHERE id = $1`,
      [await impersonatedSessionId(both.id)],
    );
    expect(row?.activeOrganizationId).toBe(fx.a.organizationId);
  });

  test('is refused when its municipality is not the one recorded at the start', async () => {
    const both = await tenancy.createStaff(fx.a.organizationId, 'supervisor', 'moved@tenancy.test');
    await tenancy.addMember(both.id, fx.b.organizationId, 'supervisor');
    const inA = await impersonate(support, both.id, fx.a.organizationId);
    await db.query(`UPDATE session SET "activeOrganizationId" = $2 WHERE id = $1`, [
      await impersonatedSessionId(both.id),
      fx.b.organizationId,
    ]);

    const read = await client.get('/admin/trucks', inA.headers);
    const write = await client.post('/admin/trucks', { name: 'Truck moved', license_plate: 'MOV-0001' }, inA.headers);

    expect([read.status, write.status]).toEqual([UNAUTHORIZED, UNAUTHORIZED]);
    expect(await db.query(`SELECT 1 FROM truck WHERE name = 'Truck moved'`)).toEqual([]);
  });

  test('stopping ends the impersonation and returns the support session', async () => {
    const asOwner = await impersonate(support, owner().id);

    const stopped = await client.post('/support/stop-impersonating', {}, asOwner.headers);

    expect(stopped.status).toBe(HTTP_STATUS.OK);
    expect((await client.get('/admin/trucks', asOwner.headers)).status).toBe(UNAUTHORIZED);
    expect((await client.get('/support/organizations', support.headers)).status).toBe(HTTP_STATUS.OK);
    const stops = (await auditRows()).filter((entry) => entry.action === 'impersonation.stop');
    expect(stops.at(-1)?.status_code).toBe(HTTP_STATUS.OK);
  });

  test('a stop whose audit row cannot be written leaves the session live', async () => {
    const asOwner = await impersonate(support, owner().id);
    const sessionId = await impersonatedSessionId(owner().id);
    await db.query(
      `CREATE FUNCTION refuse_stop_audit() RETURNS trigger LANGUAGE plpgsql AS
       $$ BEGIN RAISE EXCEPTION 'stop audit refused'; END $$`,
    );
    await db.query(
      `CREATE TRIGGER refuse_stop_audit BEFORE INSERT ON support_audit
       FOR EACH ROW WHEN (NEW.action = 'impersonation.stop') EXECUTE FUNCTION refuse_stop_audit()`,
    );
    try {
      const stopped = await client.post('/support/stop-impersonating', {}, asOwner.headers);

      expect(stopped.status).toBeGreaterThanOrEqual(500);
    } finally {
      await db.query('DROP TRIGGER refuse_stop_audit ON support_audit');
      await db.query('DROP FUNCTION refuse_stop_audit()');
    }

    expect(await db.query('SELECT 1 FROM session WHERE id = $1', [sessionId])).toHaveLength(1);
    expect((await client.get('/admin/trucks', asOwner.headers)).status).toBe(HTTP_STATUS.OK);
    expect(
      (await auditRows()).some((entry) => entry.session_id === sessionId && entry.action === 'impersonation.stop'),
    ).toBe(false);
  });

  test('a stop whose session cannot be ended stays recorded as an attempt with no status', async () => {
    const asOwner = await impersonate(support, owner().id);
    const sessionId = await impersonatedSessionId(owner().id);
    await db.query(
      `CREATE FUNCTION refuse_session_delete() RETURNS trigger LANGUAGE plpgsql AS
       $$ BEGIN RAISE EXCEPTION 'session delete refused'; END $$`,
    );
    await db.query(
      `CREATE TRIGGER refuse_session_delete BEFORE DELETE ON session
       FOR EACH ROW EXECUTE FUNCTION refuse_session_delete()`,
    );
    try {
      const stopped = await client.post('/support/stop-impersonating', {}, asOwner.headers);

      expect(stopped.status).toBeGreaterThanOrEqual(500);
    } finally {
      await db.query('DROP TRIGGER refuse_session_delete ON session');
      await db.query('DROP FUNCTION refuse_session_delete()');
    }

    const stops = (await auditRows()).filter(
      (entry) => entry.session_id === sessionId && entry.action === 'impersonation.stop',
    );
    expect(stops).toHaveLength(1);
    expect(stops[0]?.status_code).toBeNull();
    expect(await db.query('SELECT 1 FROM session WHERE id = $1', [sessionId])).toHaveLength(1);
  });
});

describe('an impersonated session expires', () => {
  test('once its expiry has passed', async () => {
    const asOwner = await impersonate(support, owner().id);
    expect((await client.get('/admin/trucks', asOwner.headers)).status).toBe(HTTP_STATUS.OK);

    await db.query(`UPDATE session SET "expiresAt" = now() - interval '1 minute' WHERE id = $1`, [
      await impersonatedSessionId(owner().id),
    ]);

    const read = await client.get('/admin/trucks', asOwner.headers);
    const write = await client.post('/admin/trucks', { name: 'Late', license_plate: 'PLATE-LATE' }, asOwner.headers);
    expect([read.status, write.status]).toEqual([UNAUTHORIZED, UNAUTHORIZED]);
    expect(await db.query(`SELECT 1 FROM truck WHERE name = 'Late'`)).toEqual([]);
  });

  test('fifteen minutes after it began, even when its expiry was pushed out', async () => {
    const asOwner = await impersonate(support, owner().id);
    await db.query(
      `UPDATE session SET "createdAt" = now() - interval '16 minutes', "expiresAt" = now() + interval '7 days' WHERE id = $1`,
      [await impersonatedSessionId(owner().id)],
    );

    const response = await client.post('/admin/trucks', { name: 'Late', license_plate: 'PLATE-LATE' }, asOwner.headers);

    expect(response.status).toBe(UNAUTHORIZED);
  });

  test('is still valid inside its fifteen minutes', async () => {
    const asOwner = await impersonate(support, owner().id);
    await db.query(`UPDATE session SET "createdAt" = now() - interval '10 minutes' WHERE id = $1`, [
      await impersonatedSessionId(owner().id),
    ]);

    expect((await client.get('/admin/trucks', asOwner.headers)).status).toBe(HTTP_STATUS.OK);
  });

  test('when the impersonator is no longer a support user', async () => {
    const other = await tenancy.createSupport('leaving-support@tenancy.test');
    const asOwner = await impersonate(other, owner().id);
    expect((await client.get('/admin/trucks', asOwner.headers)).status).toBe(HTTP_STATUS.OK);

    await db.query(`UPDATE "user" SET role = 'citizen' WHERE id = $1`, [other.id]);

    expect((await client.get('/admin/trucks', asOwner.headers)).status).toBe(UNAUTHORIZED);
  });
});

describe('impersonation targets', () => {
  const impersonateStatus = async (as: Person, userId: string) =>
    (await client.post('/support/impersonate', { userId }, as.headers)).status;

  test('a support user cannot be impersonated', async () => {
    const other = await tenancy.createSupport('another-support@tenancy.test');

    expect(await impersonateStatus(support, other.id)).toBe(HTTP_STATUS.FORBIDDEN);
  });

  test('a banned user cannot be impersonated', async () => {
    await db.query(`UPDATE "user" SET banned = true WHERE id = $1`, [fx.b.driver.id]);
    try {
      expect(await impersonateStatus(support, fx.b.driver.id)).toBe(HTTP_STATUS.FORBIDDEN);
    } finally {
      await db.query(`UPDATE "user" SET banned = false WHERE id = $1`, [fx.b.driver.id]);
    }
  });

  test('an unknown user cannot be impersonated', async () => {
    expect(await impersonateStatus(support, 'no-such-user')).toBe(HTTP_STATUS.NOT_FOUND);
  });

  test('an impersonated session cannot impersonate again', async () => {
    const asOwner = await impersonate(support, owner().id);

    expect(await impersonateStatus(asOwner, fx.b.owner.id)).toBe(HTTP_STATUS.FORBIDDEN);
  });

  test('a failed impersonation leaves no session and no audit row behind', async () => {
    const sessions = await db.query('SELECT id FROM session');
    const audit = await auditRows();

    await impersonateStatus(support, 'no-such-user');

    expect(await db.query('SELECT id FROM session')).toHaveLength(sessions.length);
    expect(await auditRows()).toHaveLength(audit.length);
  });
});

describe('an impersonator cannot take over an account login', () => {
  const credentialsOf = (userId: string) =>
    db.query<{ email: string; password: string }>(
      `SELECT u.email, a.password FROM "user" u JOIN account a ON a."userId" = u.id AND a."providerId" = 'credential' WHERE u.id = $1`,
      [userId],
    );

  test('a new password is refused with a 403 and an audit row', async () => {
    const asOwner = await impersonate(support, owner().id);
    const before = await credentialsOf(fx.a.driver.id);

    const response = await client.patch<ErrorResponse>(
      `/admin/users/${fx.a.driver.id}`,
      { name: 'Driver A', email: fx.a.driver.email, password: 'taken-over-password-1' },
      asOwner.headers,
    );

    expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
    expect(await credentialsOf(fx.a.driver.id)).toEqual(before);
    expect((await auditRows()).at(-1)).toMatchObject({
      action: 'write',
      impersonator_id: support.id,
      method: 'PATCH',
      path: '/api/admin/users/:id',
      status_code: HTTP_STATUS.FORBIDDEN,
    });
  });

  test('a new email is refused with a 403', async () => {
    const asOwner = await impersonate(support, owner().id);
    const before = await credentialsOf(fx.a.driver.id);

    const response = await client.patch<ErrorResponse>(
      `/admin/users/${fx.a.driver.id}`,
      { name: 'Driver A', email: 'taken-over@tenancy.test' },
      asOwner.headers,
    );

    expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
    expect(await credentialsOf(fx.a.driver.id)).toEqual(before);
  });

  test('the impersonated user own login cannot be changed either', async () => {
    const asSupervisor = await impersonate(support, fx.a.supervisor.id);

    const response = await client.patch(
      `/admin/users/${fx.a.driver.id}`,
      { name: 'Driver A', email: fx.a.driver.email, password: 'another-password-1' },
      asSupervisor.headers,
    );

    expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
  });

  test('a name change and a new user stay allowed, and are audited', async () => {
    const asOwner = await impersonate(support, owner().id);

    const renamed = await client.patch(
      `/admin/users/${fx.a.driver.id}`,
      { name: 'Driver A renamed', email: fx.a.driver.email },
      asOwner.headers,
    );
    const created = await client.post(
      '/admin/users',
      {
        name: 'Created by support',
        email: 'created-by-support@tenancy.test',
        password: 'created-password-1',
        role: 'driver',
      },
      asOwner.headers,
    );

    expect([renamed.status, created.status]).toEqual([HTTP_STATUS.OK, HTTP_STATUS.CREATED]);
    const sessionId = await impersonatedSessionId(owner().id);
    const paths = (await auditRows())
      .filter((entry) => entry.action === 'write' && entry.session_id === sessionId)
      .map((entry) => `${entry.method} ${entry.path} ${entry.status_code}`);
    expect(paths).toEqual(['PATCH /api/admin/users/:id 200', 'POST /api/admin/users 201']);
  });
});

describe('a municipality owner or admin cannot grant the platform role or impersonate', () => {
  const password = 'admin-created-password-1';
  let admin: Person;

  beforeAll(async () => {
    const created = await client.post<SuccessResponse<{ id: string }>>(
      '/admin/users',
      { name: 'Admin A Two', email: 'admin-a@tenancy.test', password, role: 'admin' },
      owner().headers,
    );
    const email = 'admin-a@tenancy.test';
    const signIn = await client.post('/auth/sign-in/email', { email, password });
    const [cookie = ''] = (signIn.headers.get('set-cookie') ?? '').split(';');
    admin = await tenancy.switchTo(
      { id: created.data.data.id, email, headers: { Cookie: cookie } },
      fx.a.organizationId,
    );
  });

  const roleOf = async (userId: string) =>
    (await db.query<{ role: string }>('SELECT role FROM "user" WHERE id = $1', [userId]))[0]?.role;

  test('creating a user with the support role is refused', async () => {
    const responses = await Promise.all(
      [owner(), admin].map((person) =>
        client.post(
          '/admin/users',
          { name: 'Sneaky', email: `sneaky-${person.email}`, password: 'sneaky-password-1', role: 'support' },
          person.headers,
        ),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.BAD_REQUEST]);
    expect(await db.query(`SELECT 1 FROM "user" WHERE role = 'support' AND email LIKE 'sneaky-%'`)).toEqual([]);
  });

  test('an update cannot change a role', async () => {
    const before = await roleOf(fx.a.driver.id);

    const response = await client.patch(
      `/admin/users/${fx.a.driver.id}`,
      { name: 'Driver A', email: fx.a.driver.email, role: 'support' },
      owner().headers,
    );

    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(await roleOf(fx.a.driver.id)).toBe(before);
  });

  test('signing up with the support role in the body makes a citizen', async () => {
    await client.post('/auth/sign-up/email', {
      email: 'self-support@tenancy.test',
      password: 'self-support-password-1',
      name: 'Self Support',
      role: 'support',
    });

    const rows = await db.query<{ role: string }>(`SELECT role FROM "user" WHERE email = 'self-support@tenancy.test'`);
    expect(rows.map((row) => row.role)).not.toContain('support');
  });

  test('the support routes refuse them, impersonation included', async () => {
    await Promise.all(
      [owner(), admin, fx.a.supervisor].map(async (person) => {
        const impersonation = await client.post('/support/impersonate', { userId: fx.b.owner.id }, person.headers);
        const stop = await client.post('/support/stop-impersonating', {}, person.headers);
        const read = await client.get('/support/organizations', person.headers);

        expect([impersonation.status, stop.status, read.status]).toEqual([
          HTTP_STATUS.FORBIDDEN,
          HTTP_STATUS.FORBIDDEN,
          HTTP_STATUS.FORBIDDEN,
        ]);
      }),
    );
    expect(
      await db.query(`SELECT 1 FROM session WHERE "userId" = $1 AND "impersonatedBy" IS NOT NULL`, [fx.b.owner.id]),
    ).toEqual([]);
  });

  test.each(['/auth/admin/impersonate-user', '/auth/admin/stop-impersonating', '/auth/admin/set-role'])(
    'the plugin endpoint %s stays unmounted, for support too',
    async (path) => {
      const responses = await Promise.all(
        [owner(), support].map((person) =>
          client.post(path, { userId: fx.b.owner.id, role: 'support' }, person.headers),
        ),
      );

      expect(responses.map((response) => response.status)).toEqual([HTTP_STATUS.NOT_FOUND, HTTP_STATUS.NOT_FOUND]);
    },
  );

  describe('the admin plugin role set', () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const auth = createAppAuth({
      pool,
      secret: process.env.BETTER_AUTH_SECRET ?? '',
      baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:4000',
    });
    const actions = [
      'create',
      'list',
      'set-role',
      'ban',
      'impersonate',
      'impersonate-admins',
      'delete',
      'set-password',
    ] as const;
    const allowed = async (userId: string, action: (typeof actions)[number]) => {
      const result = await auth.api.userHasPermission({ body: { userId, permissions: { user: [action] } } });
      return result.success;
    };

    afterAll(async () => {
      await pool.end();
    });

    const grantedTo = async (userId: string) => {
      const results = await Promise.all(actions.map((action) => allowed(userId, action)));
      return actions.filter((_, index) => results[index]);
    };

    test('grants a support user impersonation and nothing else', async () => {
      expect(await grantedTo(support.id)).toEqual(['impersonate']);
    });

    test('grants no municipality role anything', async () => {
      const granted = await Promise.all(
        [owner(), admin, fx.a.supervisor, fx.a.driver, fx.citizen].map((person) => grantedTo(person.id)),
      );

      expect(granted).toEqual([[], [], [], [], []]);
    });
  });
});
