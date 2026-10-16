import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { BaseTest } from './base-test';
import { HTTP_STATUS } from './config';
import type { Issue, SuccessResponse } from './types';
import { createTestIssue } from './utils';

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
    test.each(['missed_collection', 'other'])('should report an issue of type %s', async (type) => {
      const issueData = createTestIssue(type);

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
