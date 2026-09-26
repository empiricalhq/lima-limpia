import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { BaseTest } from './base-test';
import { HTTP_STATUS } from './config';
import type { ErrorResponse, Route, SuccessResponse, Truck, User } from './types';
import { createTestRoute, createTestTruck } from './utils';

describe('Admin API', () => {
  const baseTest = new BaseTest();

  beforeEach(async () => {
    await baseTest.setup();
    await baseTest.ctx.auth.loginAs('admin');
  });

  afterAll(async () => {
    await baseTest.teardown();
  });

  describe('Trucks', () => {
    test('should create a new truck', async () => {
      const truckData = createTestTruck('Test Truck 1');

      const response = await baseTest.ctx.client.post<SuccessResponse<Truck>>(
        '/admin/trucks',
        truckData,
        baseTest.ctx.auth.getHeaders('admin'),
      );

      expect(response.status).toBe(HTTP_STATUS.CREATED);
      expect(response.data.data).toMatchObject({
        id: expect.any(String),
        name: truckData.name,
        license_plate: truckData.license_plate,
      });
    });

    test('should fail with duplicate license plate', async () => {
      const truckData = { name: 'Test Truck', license_plate: 'DUPLICATE' };

      await baseTest.ctx.client.post('/admin/trucks', truckData, baseTest.ctx.auth.getHeaders('admin'));

      const response = await baseTest.ctx.client.post<ErrorResponse>(
        '/admin/trucks',
        truckData,
        baseTest.ctx.auth.getHeaders('admin'),
      );

      expect(response.status).toBe(HTTP_STATUS.CONFLICT);
      expect(response.data.error).toBe('Resource already exists');
    });

    test('should list all trucks', async () => {
      await baseTest.ctx.client.post(
        '/admin/trucks',
        createTestTruck('Listable Truck'),
        baseTest.ctx.auth.getHeaders('admin'),
      );

      const response = await baseTest.ctx.client.get<SuccessResponse<Truck[]>>(
        '/admin/trucks',
        baseTest.ctx.auth.getHeaders('admin'),
      );

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(Array.isArray(response.data.data)).toBe(true);
      expect(response.data.data.length).toBeGreaterThan(0);
    });
  });

  describe('Routes', () => {
    test('should create a new route with waypoints', async () => {
      const routeData = createTestRoute('Downtown Route');

      const response = await baseTest.ctx.client.post<SuccessResponse<Route>>(
        '/admin/routes',
        routeData,
        baseTest.ctx.auth.getHeaders('admin'),
      );

      expect(response.status).toBe(HTTP_STATUS.CREATED);
      expect(response.data.data).toMatchObject({
        id: expect.any(String),
        name: routeData.name,
      });
    });
  });

  describe('Users', () => {
    test('creates a supervisor who can sign in and use their organization role', async () => {
      const email = `supervisor-${Date.now()}@test.com`;

      const createResponse = await baseTest.ctx.client.post<SuccessResponse<User>>(
        '/admin/users',
        { name: 'Test Supervisor', email, password: 'supervisor-password-123', role: 'supervisor' },
        baseTest.ctx.auth.getHeaders('admin'),
      );

      expect(createResponse.status).toBe(HTTP_STATUS.CREATED);
      expect(createResponse.data.data).toMatchObject({ email, role: 'supervisor' });

      // The role only means anything if the user also landed in the organization's member table:
      // org-gated routes resolve permissions from membership, not the bare global role.
      const session = await baseTest.ctx.auth.login(email, 'supervisor-password-123');
      expect(session.member).toMatchObject({ role: 'supervisor' });

      const trucksResponse = await baseTest.ctx.client.get<SuccessResponse<Truck[]>>('/admin/trucks', {
        Cookie: session.cookie,
      });
      expect(trucksResponse.status).toBe(HTTP_STATUS.OK);
    });

    test.each(['admin', 'supervisor', 'driver'] as const)(
      'stores a created %s with that role on both the user and the membership',
      async (role) => {
        const email = `${role}-roles-${Date.now()}@test.com`;

        const createResponse = await baseTest.ctx.client.post<SuccessResponse<User>>(
          '/admin/users',
          { name: `Test ${role}`, email, password: 'created-password-123', role },
          baseTest.ctx.auth.getHeaders('admin'),
        );
        expect(createResponse.status).toBe(HTTP_STATUS.CREATED);

        // The dashboard sign-in reads `user.role` from get-session, not the membership.
        const session = await baseTest.ctx.auth.login(email, 'created-password-123');
        expect(session.user).toMatchObject({ email, role });
        expect(session.member).toMatchObject({ role });
      },
    );

    test('lets a created admin manage the organization', async () => {
      const email = `admin-manage-${Date.now()}@test.com`;
      await baseTest.ctx.client.post(
        '/admin/users',
        { name: 'Created Admin', email, password: 'created-password-123', role: 'admin' },
        baseTest.ctx.auth.getHeaders('admin'),
      );
      const session = await baseTest.ctx.auth.login(email, 'created-password-123');

      const trucksResponse = await baseTest.ctx.client.get('/admin/trucks', { Cookie: session.cookie });
      expect(trucksResponse.status).toBe(HTTP_STATUS.OK);

      const createResponse = await baseTest.ctx.client.post(
        '/admin/users',
        {
          name: 'Second Admin',
          email: `second-${email}`,
          password: 'created-password-123',
          role: 'admin',
        },
        { Cookie: session.cookie },
      );
      expect(createResponse.status).toBe(HTTP_STATUS.CREATED);
    });

    test('lists supervisors separately from drivers', async () => {
      const supervisorEmail = `listed-supervisor-${Date.now()}@test.com`;
      const driverEmail = `listed-driver-${Date.now()}@test.com`;
      const admin = baseTest.ctx.auth.getHeaders('admin');
      await baseTest.ctx.client.post(
        '/admin/users',
        { name: 'Listed Supervisor', email: supervisorEmail, password: 'created-password-123', role: 'supervisor' },
        admin,
      );
      await baseTest.ctx.client.post(
        '/admin/users',
        { name: 'Listed Driver', email: driverEmail, password: 'created-password-123', role: 'driver' },
        admin,
      );

      const response = await baseTest.ctx.client.get<SuccessResponse<User[]>>('/admin/supervisors', admin);

      expect(response.status).toBe(HTTP_STATUS.OK);
      const emails = response.data.data.map((user) => user.email);
      expect(emails).toContain(supervisorEmail);
      expect(emails).not.toContain(driverEmail);
    });

    test('updates a driver name, email and password', async () => {
      const email = `edit-driver-${Date.now()}@test.com`;
      const admin = baseTest.ctx.auth.getHeaders('admin');
      const created = await baseTest.ctx.client.post<SuccessResponse<User>>(
        '/admin/users',
        { name: 'Before Edit', email, password: 'old-password-123', role: 'driver' },
        admin,
      );
      const newEmail = `renamed-${email}`;

      const response = await baseTest.ctx.client.patch<SuccessResponse<User>>(
        `/admin/users/${created.data.data.id}`,
        { name: 'After Edit', email: newEmail, password: 'new-password-123' },
        admin,
      );

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.data.data).toMatchObject({ id: created.data.data.id, name: 'After Edit', email: newEmail });
      const session = await baseTest.ctx.auth.login(newEmail, 'new-password-123');
      expect(session.user).toMatchObject({ name: 'After Edit', role: 'driver' });
    });

    test('keeps the password when an update does not send one', async () => {
      const email = `keep-password-${Date.now()}@test.com`;
      const admin = baseTest.ctx.auth.getHeaders('admin');
      const created = await baseTest.ctx.client.post<SuccessResponse<User>>(
        '/admin/users',
        { name: 'Keep Password', email, password: 'old-password-123', role: 'driver' },
        admin,
      );

      await baseTest.ctx.client.patch(`/admin/users/${created.data.data.id}`, { name: 'Renamed Driver', email }, admin);

      const session = await baseTest.ctx.auth.login(email, 'old-password-123');
      expect(session.user).toMatchObject({ name: 'Renamed Driver' });
    });

    test('rejects an update to an email already in use', async () => {
      const admin = baseTest.ctx.auth.getHeaders('admin');
      const takenEmail = `taken-${Date.now()}@test.com`;
      await baseTest.ctx.client.post(
        '/admin/users',
        { name: 'Email Owner', email: takenEmail, password: 'created-password-123', role: 'driver' },
        admin,
      );
      const created = await baseTest.ctx.client.post<SuccessResponse<User>>(
        '/admin/users',
        { name: 'Wants Email', email: `wants-${takenEmail}`, password: 'created-password-123', role: 'driver' },
        admin,
      );

      const response = await baseTest.ctx.client.patch(
        `/admin/users/${created.data.data.id}`,
        { name: 'Wants Email', email: takenEmail },
        admin,
      );

      expect(response.status).toBe(HTTP_STATUS.CONFLICT);
    });

    test('rejects creating a user with an email already in use', async () => {
      const admin = baseTest.ctx.auth.getHeaders('admin');
      const email = `duplicate-${Date.now()}@test.com`;
      const first = await baseTest.ctx.client.post(
        '/admin/users',
        { name: 'First Owner', email, password: 'created-password-123', role: 'driver' },
        admin,
      );
      expect(first.status).toBe(HTTP_STATUS.CREATED);

      const second = await baseTest.ctx.client.post(
        '/admin/users',
        { name: 'Second Claimant', email, password: 'created-password-123', role: 'admin' },
        admin,
      );

      expect(second.status).toBe(HTTP_STATUS.CONFLICT);
    });

    test('treats emails as case-insensitive when creating a user', async () => {
      const admin = baseTest.ctx.auth.getHeaders('admin');
      const lower = `mixed-case-${Date.now()}@test.com`;
      const created = await baseTest.ctx.client.post<SuccessResponse<User>>(
        '/admin/users',
        { name: 'Mixed Case', email: lower.toUpperCase(), password: 'created-password-123', role: 'driver' },
        admin,
      );
      expect(created.status).toBe(HTTP_STATUS.CREATED);
      const [stored] = await baseTest.ctx.db.query<{ email: string }>(`SELECT email FROM "user" WHERE id = $1`, [
        created.data.data.id,
      ]);
      expect(stored?.email).toBe(lower);

      const duplicate = await baseTest.ctx.client.post(
        '/admin/users',
        { name: 'Mixed Case Again', email: lower, password: 'created-password-123', role: 'driver' },
        admin,
      );

      expect(duplicate.status).toBe(HTTP_STATUS.CONFLICT);
    });

    test('revokes every session of a user whose password changes', async () => {
      const email = `revoke-${Date.now()}@test.com`;
      const admin = baseTest.ctx.auth.getHeaders('admin');
      const created = await baseTest.ctx.client.post<SuccessResponse<User>>(
        '/admin/users',
        { name: 'Revoked Driver', email, password: 'old-password-123', role: 'driver' },
        admin,
      );
      const session = await baseTest.ctx.auth.login(email, 'old-password-123');
      const before = await baseTest.ctx.client.get<{ user?: User } | null>('/auth/get-session', {
        Cookie: session.cookie,
      });
      expect(before.data?.user?.email).toBe(email);

      await baseTest.ctx.client.patch(
        `/admin/users/${created.data.data.id}`,
        { name: 'Revoked Driver', email, password: 'new-password-123' },
        admin,
      );

      const after = await baseTest.ctx.client.get<{ user?: User } | null>('/auth/get-session', {
        Cookie: session.cookie,
      });
      expect(after.data?.user).toBeUndefined();
      const oldPassword = await baseTest.ctx.client.post('/auth/sign-in/email', {
        email,
        password: 'old-password-123',
      });
      expect(oldPassword.status).not.toBe(HTTP_STATUS.OK);
    });

    test('keeps sessions when an update sends no password', async () => {
      const email = `keep-session-${Date.now()}@test.com`;
      const admin = baseTest.ctx.auth.getHeaders('admin');
      const created = await baseTest.ctx.client.post<SuccessResponse<User>>(
        '/admin/users',
        { name: 'Kept Session', email, password: 'old-password-123', role: 'driver' },
        admin,
      );
      const session = await baseTest.ctx.auth.login(email, 'old-password-123');

      await baseTest.ctx.client.patch(
        `/admin/users/${created.data.data.id}`,
        { name: 'Kept Session Renamed', email },
        admin,
      );

      const after = await baseTest.ctx.client.get<{ user?: User } | null>('/auth/get-session', {
        Cookie: session.cookie,
      });
      expect(after.data?.user?.email).toBe(email);
    });

    test('changes nothing when the email is taken, password included', async () => {
      const admin = baseTest.ctx.auth.getHeaders('admin');
      const takenEmail = `taken-atomic-${Date.now()}@test.com`;
      await baseTest.ctx.client.post(
        '/admin/users',
        { name: 'Email Owner', email: takenEmail, password: 'created-password-123', role: 'driver' },
        admin,
      );
      const email = `atomic-${takenEmail}`;
      const created = await baseTest.ctx.client.post<SuccessResponse<User>>(
        '/admin/users',
        { name: 'Atomic Driver', email, password: 'old-password-123', role: 'driver' },
        admin,
      );
      const session = await baseTest.ctx.auth.login(email, 'old-password-123');

      const response = await baseTest.ctx.client.patch(
        `/admin/users/${created.data.data.id}`,
        { name: 'Changed Name', email: takenEmail, password: 'new-password-123' },
        admin,
      );

      expect(response.status).toBe(HTTP_STATUS.CONFLICT);
      const stillOld = await baseTest.ctx.client.post('/auth/sign-in/email', { email, password: 'old-password-123' });
      expect(stillOld.status).toBe(HTTP_STATUS.OK);
      const newPassword = await baseTest.ctx.client.post('/auth/sign-in/email', {
        email,
        password: 'new-password-123',
      });
      expect(newPassword.status).not.toBe(HTTP_STATUS.OK);
      const kept = await baseTest.ctx.client.get<{ user?: User } | null>('/auth/get-session', {
        Cookie: session.cookie,
      });
      expect(kept.data?.user).toMatchObject({ name: 'Atomic Driver', email });
    });

    test('changes nothing when the password write fails', async () => {
      const admin = baseTest.ctx.auth.getHeaders('admin');
      const email = `no-credential-${Date.now()}@test.com`;
      const created = await baseTest.ctx.client.post<SuccessResponse<User>>(
        '/admin/users',
        { name: 'No Credential', email, password: 'old-password-123', role: 'driver' },
        admin,
      );
      await baseTest.ctx.db.query(`DELETE FROM account WHERE "userId" = $1`, [created.data.data.id]);

      const response = await baseTest.ctx.client.patch(
        `/admin/users/${created.data.data.id}`,
        { name: 'Half Applied', email: `changed-${email}`, password: 'new-password-123' },
        admin,
      );

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      const [row] = await baseTest.ctx.db.query<{ name: string; email: string }>(
        `SELECT name, email FROM "user" WHERE id = $1`,
        [created.data.data.id],
      );
      expect(row).toEqual({ name: 'No Credential', email });
    });

    test('does not update a user outside the organization', async () => {
      const citizen = await baseTest.ctx.auth.loginAs('citizen');

      const response = await baseTest.ctx.client.patch(
        `/admin/users/${citizen.user.id}`,
        { name: 'Hijacked Citizen', email: citizen.user.email, password: 'hijacked-password-123' },
        baseTest.ctx.auth.getHeaders('admin'),
      );

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    });

    test('keeps a supervisor to managing drivers', async () => {
      const admin = baseTest.ctx.auth.getHeaders('admin');
      const supervisorEmail = `limited-supervisor-${Date.now()}@test.com`;
      await baseTest.ctx.client.post(
        '/admin/users',
        { name: 'Limited Supervisor', email: supervisorEmail, password: 'created-password-123', role: 'supervisor' },
        admin,
      );
      const adminUser = await baseTest.ctx.client.post<SuccessResponse<User>>(
        '/admin/users',
        {
          name: 'Protected Admin',
          email: `protected-${supervisorEmail}`,
          password: 'created-password-123',
          role: 'admin',
        },
        admin,
      );
      const supervisor = await baseTest.ctx.auth.login(supervisorEmail, 'created-password-123');
      const asSupervisor = { Cookie: supervisor.cookie };

      const createAdmin = await baseTest.ctx.client.post(
        '/admin/users',
        {
          name: 'Escalated Admin',
          email: `escalated-${supervisorEmail}`,
          password: 'created-password-123',
          role: 'admin',
        },
        asSupervisor,
      );
      const updateAdmin = await baseTest.ctx.client.patch(
        `/admin/users/${adminUser.data.data.id}`,
        { name: 'Protected Admin', email: adminUser.data.data.email, password: 'hijacked-password-123' },
        asSupervisor,
      );
      const createDriver = await baseTest.ctx.client.post(
        '/admin/users',
        {
          name: 'Allowed Driver',
          email: `allowed-${supervisorEmail}`,
          password: 'created-password-123',
          role: 'driver',
        },
        asSupervisor,
      );

      expect(createAdmin.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(updateAdmin.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(createDriver.status).toBe(HTTP_STATUS.CREATED);
    });

    test('forbids a supervisor from deleting a truck', async () => {
      const truckData = createTestTruck('Supervisor-guarded Truck');
      const created = await baseTest.ctx.client.post<SuccessResponse<Truck>>(
        '/admin/trucks',
        truckData,
        baseTest.ctx.auth.getHeaders('admin'),
      );

      const email = `supervisor-delete-${Date.now()}@test.com`;
      await baseTest.ctx.client.post(
        '/admin/users',
        { name: 'Delete-Blocked Supervisor', email, password: 'supervisor-password-123', role: 'supervisor' },
        baseTest.ctx.auth.getHeaders('admin'),
      );
      const session = await baseTest.ctx.auth.login(email, 'supervisor-password-123');

      const deleteResponse = await baseTest.ctx.client.delete(`/admin/trucks/${created.data.data.id}`, {
        Cookie: session.cookie,
      });

      expect(deleteResponse.status).toBe(HTTP_STATUS.FORBIDDEN);
    });
  });

  describe('Authorization', () => {
    test('should forbid non-admin users', async () => {
      await baseTest.ctx.auth.loginAs('citizen');

      const response = await baseTest.ctx.client.get('/admin/trucks', baseTest.ctx.auth.getHeaders('citizen'));

      expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
    });
  });
});
