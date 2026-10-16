import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { BaseTest } from './base-test';
import { HTTP_STATUS } from './config';
import type { ErrorResponse } from './types';

/**
 * Every mounted Better Auth endpoint that writes `member.role` or the global `user.role` is
 * reachable directly, without going through the app's own admin routes. These tests hit them the
 * same way an attacker would: through /api/auth, not through /api/admin.
 */
describe('Authorization boundaries', () => {
  const baseTest = new BaseTest();

  beforeEach(async () => {
    await baseTest.setup();
  });

  afterAll(async () => {
    await baseTest.teardown();
  });

  function extractCookie(headers: Headers): string {
    const cookieHeader = headers.get('set-cookie');
    if (!cookieHeader) {
      throw new Error('No session cookie received');
    }
    const [cookie] = cookieHeader.split(';');
    if (!cookie) {
      throw new Error('Invalid cookie format');
    }
    return cookie;
  }

  async function signUpAndSignIn(email: string): Promise<string> {
    const password = 'attacker-password-123';
    await baseTest.ctx.client.post('/auth/sign-up/email', { email, password, name: 'Self-registered Citizen' });
    const signInRes = await baseTest.ctx.client.post('/auth/sign-in/email', { email, password });
    return extractCookie(signInRes.headers);
  }

  test('a self-registered citizen cannot reach owner-only routes by creating their own organization', async () => {
    const cookie = await signUpAndSignIn(`escalate-${Date.now()}@test.com`);

    await baseTest.ctx.client.post(
      '/auth/organization/create',
      { name: 'Escalation Org', slug: `escalation-org-${Date.now()}` },
      { Cookie: cookie },
    );

    const trucksRes = await baseTest.ctx.client.get<ErrorResponse>('/admin/trucks', { Cookie: cookie });

    expect(trucksRes.status).toBe(HTTP_STATUS.FORBIDDEN);
  });

  /**
   * Better Auth's creator and permission checks do not cover every plugin endpoint the same way
   * (`allowCreatorAllPermissions` bypasses `roles` entirely for an organization's creator), so
   * only the `/api/auth/*` paths this app's own clients call are mounted. Every other path returns
   * 404 before Better Auth's handler runs, whoever the caller is.
   */
  describe('/api/auth route allowlist', () => {
    const disallowedGetPaths = ['/auth/organization/get-full-organization', '/auth/organization/list-user-invitations'];

    const disallowedPostPaths = [
      '/auth/organization/create',
      '/auth/organization/update-member-role',
      '/auth/organization/invite-member',
      '/auth/organization/accept-invitation',
      '/auth/organization/remove-member',
      '/auth/organization/leave',
      '/auth/organization/delete',
      '/auth/admin/set-role',
      '/auth/admin/create-user',
      '/auth/admin/ban-user',
      '/auth/admin/impersonate-user',
      '/auth/admin/stop-impersonating',
      '/auth/admin/remove-user',
      '/auth/admin/set-user-password',
    ];

    test.each(disallowedGetPaths)('GET %s is not mounted', async (path) => {
      await baseTest.ctx.auth.loginAs('admin');

      const response = await baseTest.ctx.client.get<ErrorResponse>(path, baseTest.ctx.auth.getHeaders('admin'));

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    });

    test.each(disallowedPostPaths)('POST %s is not mounted', async (path) => {
      await baseTest.ctx.auth.loginAs('admin');

      const response = await baseTest.ctx.client.post<ErrorResponse>(path, {}, baseTest.ctx.auth.getHeaders('admin'));

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
    });

    const allowedGetPaths = [
      '/auth/get-session',
      '/auth/organization/get-active-member-role',
      '/auth/organization/list',
    ];

    test.each(allowedGetPaths)('GET %s is still mounted', async (path) => {
      await baseTest.ctx.auth.loginAs('admin');

      const response = await baseTest.ctx.client.get<ErrorResponse>(path, baseTest.ctx.auth.getHeaders('admin'));

      expect(response.status).not.toBe(HTTP_STATUS.NOT_FOUND);
    });

    test('POST /auth/organization/set-active is still mounted', async () => {
      await baseTest.ctx.auth.loginAs('admin');

      const response = await baseTest.ctx.client.post<ErrorResponse>(
        '/auth/organization/set-active',
        { organizationId: 'not-a-real-org' },
        baseTest.ctx.auth.getHeaders('admin'),
      );

      expect(response.status).not.toBe(HTTP_STATUS.NOT_FOUND);
    });
  });
});
