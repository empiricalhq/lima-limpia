import { type Context, Hono, type MiddlewareHandler } from 'hono';
import { notFound } from '@/internal/shared/utils/response';
import type { AuthService } from './service';

/**
 * Better Auth's organization plugin grants an organization's creator (`owner`, the plugin's
 * `creatorRole` default) every permission on member-role endpoints regardless of `roles`/`ac`
 * (`allowCreatorAllPermissions`, on by default): an owner can call `update-member-role` and
 * promote any member, including to owner, no matter how `roles` is configured. Closing individual
 * endpoints at the access-control level cannot reach this case, so only the `/api/auth/*` paths
 * this app's own clients (apps/web, apps/citizen) actually call are mounted here; every other
 * endpoint the `organization` and `admin` plugins register — including `update-member-role`,
 * `invite-member`, `accept-invitation`, `get-full-organization`, and the `admin` plugin's own
 * `set-role`/`create-user`/`ban-user`/`impersonate-user`/`remove-user`/`set-user-password` —
 * returns 404 before Better Auth's handler ever runs.
 */
const ALLOWED_ROUTES: ReadonlyArray<{ method: 'GET' | 'POST'; path: string; refuseImpersonated?: true }> = [
  { method: 'GET', path: '/get-session' },
  { method: 'POST', path: '/sign-in/email' },
  { method: 'POST', path: '/sign-up/email' },
  { method: 'POST', path: '/sign-out' },
  { method: 'POST', path: '/request-password-reset' },
  { method: 'POST', path: '/reset-password' },
  { method: 'GET', path: '/reset-password/:token' },
  { method: 'GET', path: '/organization/get-active-member-role' },
  { method: 'GET', path: '/organization/list' },
  { method: 'POST', path: '/organization/set-active', refuseImpersonated: true },
];

export function createAuthHandler(authService: AuthService, refuseImpersonation: MiddlewareHandler): Hono {
  const auth = new Hono();

  for (const { method, path, refuseImpersonated } of ALLOWED_ROUTES) {
    const handle = (c: Context) => authService.handler(c.req.raw);
    if (refuseImpersonated) {
      auth.on(method, path, refuseImpersonation, handle);
    } else {
      auth.on(method, path, handle);
    }
  }

  auth.all('*', (c) => notFound(c));

  return auth;
}
