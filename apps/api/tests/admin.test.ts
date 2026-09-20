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
