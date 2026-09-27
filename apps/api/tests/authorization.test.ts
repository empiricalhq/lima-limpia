import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { BaseTest } from './base-test';
import { HTTP_STATUS } from './config';
import type { ErrorResponse, SuccessResponse, User } from './types';

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

  describe('self-service organization creation', () => {
    test('a self-registered citizen cannot create an organization', async () => {
      const cookie = await signUpAndSignIn(`attacker-${Date.now()}@test.com`);

      const createRes = await baseTest.ctx.client.post<ErrorResponse>(
        '/auth/organization/create',
        { name: 'Attacker Org', slug: `attacker-org-${Date.now()}` },
        { Cookie: cookie },
      );

      expect(createRes.status).toBe(HTTP_STATUS.NOT_FOUND);
    });

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
  });

  describe('member.role and user.role writers reachable over /api/auth', () => {
    test('an organization owner cannot promote a member to owner via update-member-role', async () => {
      await baseTest.ctx.auth.loginAs('admin');
      const headers = baseTest.ctx.auth.getHeaders('admin');

      const [driverMember] = await baseTest.ctx.db.query<{ id: string }>(
        `SELECT id FROM member WHERE role = 'driver' LIMIT 1`,
      );
      if (!driverMember) {
        throw new Error('Expected a seeded driver member');
      }

      // Better Auth grants an organization's creator (the seeded 'admin' test user, who owns the
      // test org) every permission on this endpoint regardless of `roles`/`ac`
      // (`allowCreatorAllPermissions`), so `canManageRole` never runs for this caller. Refused here
      // only because the route itself is not mounted, not because of any role configuration.
      const updateRes = await baseTest.ctx.client.post<ErrorResponse>(
        '/auth/organization/update-member-role',
        { memberId: driverMember.id, role: 'owner' },
        headers,
      );

      expect(updateRes.status).toBe(HTTP_STATUS.NOT_FOUND);
    });

    test('a driver cannot invite new members into the organization', async () => {
      await baseTest.ctx.auth.loginAs('driver');
      const headers = baseTest.ctx.auth.getHeaders('driver');

      const inviteRes = await baseTest.ctx.client.post<ErrorResponse>(
        '/auth/organization/invite-member',
        { email: `invitee-${Date.now()}@test.com`, role: 'admin' },
        headers,
      );

      expect(inviteRes.status).toBe(HTTP_STATUS.NOT_FOUND);
    });

    test('a citizen cannot set their own global role via admin/set-role', async () => {
      await baseTest.ctx.auth.loginAs('citizen');
      const headers = baseTest.ctx.auth.getHeaders('citizen');

      const sessionRes = await baseTest.ctx.client.get<{ user: { id: string } }>('/auth/get-session', headers);
      const userId = sessionRes.data.user.id;

      const setRoleRes = await baseTest.ctx.client.post<ErrorResponse>(
        '/auth/admin/set-role',
        { userId, role: 'admin' },
        headers,
      );

      expect(setRoleRes.status).toBe(HTTP_STATUS.NOT_FOUND);
    });

    test('a supervisor cannot promote themselves to admin via admin/set-role', async () => {
      await baseTest.ctx.auth.loginAs('admin');

      // canManageRole lets an admin create a supervisor, but a supervisor may only ever manage
      // drivers: it must not be able to reach a higher role through /api/auth directly.
      const email = `supervisor-${Date.now()}@test.com`;
      const password = 'supervisor-password-123';
      const createResponse = await baseTest.ctx.client.post<SuccessResponse<User>>(
        '/admin/users',
        { name: 'Test Supervisor', email, password, role: 'supervisor' },
        baseTest.ctx.auth.getHeaders('admin'),
      );
      expect(createResponse.status).toBe(HTTP_STATUS.CREATED);

      const session = await baseTest.ctx.auth.login(email, password);
      const headers = { Cookie: session.cookie };

      const setRoleRes = await baseTest.ctx.client.post<ErrorResponse>(
        '/auth/admin/set-role',
        { userId: session.user.id, role: 'admin' },
        headers,
      );

      expect(setRoleRes.status).toBe(HTTP_STATUS.NOT_FOUND);
    });

    test('a supervisor cannot create an admin via admin/create-user, bypassing canManageRole', async () => {
      await baseTest.ctx.auth.loginAs('admin');

      const supervisorEmail = `supervisor-${Date.now()}@test.com`;
      const supervisorPassword = 'supervisor-password-123';
      const createSupervisorResponse = await baseTest.ctx.client.post<SuccessResponse<User>>(
        '/admin/users',
        { name: 'Test Supervisor', email: supervisorEmail, password: supervisorPassword, role: 'supervisor' },
        baseTest.ctx.auth.getHeaders('admin'),
      );
      expect(createSupervisorResponse.status).toBe(HTTP_STATUS.CREATED);

      const session = await baseTest.ctx.auth.login(supervisorEmail, supervisorPassword);
      const headers = { Cookie: session.cookie };

      const createAdminRes = await baseTest.ctx.client.post<ErrorResponse>(
        '/auth/admin/create-user',
        {
          name: 'Rogue Admin',
          email: `rogue-admin-${Date.now()}@test.com`,
          password: 'rogue-password-123',
          role: 'admin',
        },
        headers,
      );

      expect(createAdminRes.status).toBe(HTTP_STATUS.NOT_FOUND);
    });
  });

  /**
   * The organization and admin plugins share this app's access-control statements with
   * `requirePermission`, and Better Auth's own creator/permission checks do not cover every plugin
   * endpoint the same way (`allowCreatorAllPermissions` bypasses `roles` entirely for an
   * organization's creator). Closing endpoints one at a time this way is a dead end: the fix is an
   * explicit allowlist of the `/api/auth/*` paths this app's own clients call
   * (`apps/api/src/internal/domains/auth/handler.ts`), with every other path returning 404 before
   * Better Auth's handler ever runs.
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
