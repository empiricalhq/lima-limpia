import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { BaseTest } from './base-test';
import { HTTP_STATUS } from './config';
import type { Issue, SuccessResponse, TruckWithDetails } from './types';
import { createTestIssue, createTestTruck } from './utils';

describe('Citizen API', () => {
  const baseTest = new BaseTest();

  beforeEach(async () => {
    await baseTest.setup();
    await baseTest.ctx.auth.loginAs('citizen');
  });

  afterAll(async () => {
    await baseTest.teardown();
  });

  describe('Profile', () => {
    test('should update location', async () => {
      const response = await baseTest.ctx.client.put<SuccessResponse<{ success: boolean }>>(
        '/citizen/profile/location',
        { lat: -12.0464, lng: -77.0428 },
        baseTest.ctx.auth.getHeaders('citizen'),
      );

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.data.data.success).toBe(true);
    });
  });

  describe('Trucks', () => {
    test('should get a list of active trucks', async () => {
      await baseTest.ctx.auth.loginAs('admin');
      const truckData = createTestTruck('Citizen Truck');
      const truckRes = await baseTest.ctx.client.post<SuccessResponse<{ id: string }>>(
        '/admin/trucks',
        truckData,
        baseTest.ctx.auth.getHeaders('admin'),
      );
      const truckId = truckRes.data.data.id;
      await baseTest.ctx.db.query(
        `INSERT INTO truck_current_location (truck_id, organization_id, lat, lng)
         SELECT id, organization_id, -12.05, -77.05 FROM truck WHERE id = $1`,
        [truckId],
      );

      await baseTest.ctx.auth.loginAs('citizen');
      const response = await baseTest.ctx.client.get<SuccessResponse<TruckWithDetails[]>>(
        '/citizen/trucks',
        baseTest.ctx.auth.getHeaders('citizen'),
      );

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(Array.isArray(response.data.data)).toBe(true);
      expect(response.data.data.length).toBeGreaterThan(0);
      expect(response.data.data[0]?.id).toBe(truckId);
      expect(response.data.data[0]?.name).toBe('Citizen Truck');
    });

    test('should prompt for location when status is checked but not set', async () => {
      const response = await baseTest.ctx.client.get<SuccessResponse<{ status: string }>>(
        '/citizen/truck/status',
        baseTest.ctx.auth.getHeaders('citizen'),
      );

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.data.data.status).toBe('LOCATION_NOT_SET');
    });
  });

  describe('Issues', () => {
    test('should report an issue with a standard type', async () => {
      const issueData = createTestIssue('missed_collection');

      const response = await baseTest.ctx.client.post<SuccessResponse<{ message: string }>>(
        '/citizen/issues',
        issueData,
        baseTest.ctx.auth.getHeaders('citizen'),
      );

      expect(response.status).toBe(HTTP_STATUS.CREATED);
      expect(response.data.data.message).toContain('Issue reported successfully');
    });

    test('should report an issue with type "other"', async () => {
      const issueData = createTestIssue('other');

      const response = await baseTest.ctx.client.post<SuccessResponse<{ message: string }>>(
        '/citizen/issues',
        issueData,
        baseTest.ctx.auth.getHeaders('citizen'),
      );

      expect(response.status).toBe(HTTP_STATUS.CREATED);
      expect(response.data.data.message).toContain('Issue reported successfully');
    });

    test('should list own issues', async () => {
      await baseTest.ctx.client.post(
        '/citizen/issues',
        createTestIssue('missed_collection'),
        baseTest.ctx.auth.getHeaders('citizen'),
      );

      const response = await baseTest.ctx.client.get<SuccessResponse<Issue[]>>(
        '/citizen/issues',
        baseTest.ctx.auth.getHeaders('citizen'),
      );

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.data.data).toHaveLength(1);
      expect(response.data.data[0]?.type).toBe('missed_collection');
    });
  });

  describe('Access Control', () => {
    test('should forbid staff users', async () => {
      await baseTest.ctx.auth.loginAs('admin');

      const response = await baseTest.ctx.client.get('/citizen/truck/status', baseTest.ctx.auth.getHeaders('admin'));

      expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
    });
  });
});
