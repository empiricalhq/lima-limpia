import { type Context, Hono, type MiddlewareHandler } from 'hono';
import { notFound } from '@/internal/shared/utils/response';
import type { AuthService } from './service';

/** The plugin access controls cannot close the organization creator's grants. Every unlisted path therefore answers 404. */
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
