import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

const HTTP_INTERNAL_SERVER_ERROR = 500;
const TRAILING_SLASH_PATTERN = /\/$/;
const SET_COOKIE = 'better-auth.session_token=fake-session; Path=/; HttpOnly';

/**
 * `/organization/list`'s scenario is chosen by the incoming session cookie, the same way
 * `proxy.test.ts`'s fake API tells scenarios apart: one server answers differently for a real
 * organization member, a real citizen (empty list), and an outage.
 */
function startFakeApi() {
  return Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      const cookie = request.headers.get('cookie') ?? '';

      if (url.pathname === '/api/auth/organization/list') {
        if (cookie.includes('citizen-token')) {
          return Response.json([]);
        }
        if (cookie.includes('member-token')) {
          return Response.json([{ id: 'org-1', name: 'Lima Garbage' }]);
        }
        // Anything else simulates the lookup itself failing (API down, database down, ...).
        return new Response('internal error', { status: HTTP_INTERNAL_SERVER_ERROR });
      }

      if (url.pathname === '/api/auth/organization/set-active') {
        return new Response(null, { headers: { 'Set-Cookie': SET_COOKIE } });
      }

      return new Response('not found', { status: 404 });
    },
  });
}

describe('setupOrganization', () => {
  let server: ReturnType<typeof startFakeApi>;
  let baseUrl: string;
  let setupOrganization: typeof import('../src/features/auth/sign-in-flow')['setupOrganization'];
  let VERIFICATION_FAILED_MESSAGE: string;

  beforeAll(async () => {
    server = startFakeApi();
    baseUrl = server.url.toString().replace(TRAILING_SLASH_PATTERN, '');
    // `lib/env.ts` reads API_BASE_URL at import time, so it must be set before `sign-in-flow.ts`
    // loads. The tests still pass `baseUrl` explicitly below so they target this fake server
    // regardless of which test file's `process.env.API_BASE_URL` value `env.ts` ends up caching.
    process.env.API_BASE_URL = baseUrl;
    ({ setupOrganization, VERIFICATION_FAILED_MESSAGE } = await import('../src/features/auth/sign-in-flow'));
  });

  afterAll(() => {
    server.stop(true);
  });

  test('an organization-list outage fails sign-in instead of falling through as no organization', async () => {
    await expect(setupOrganization('outage-token', baseUrl)).rejects.toThrow(VERIFICATION_FAILED_MESSAGE);
  });

  test('a real citizen (empty organization list) passes the session cookie through unchanged', async () => {
    await expect(setupOrganization('citizen-token', baseUrl)).resolves.toBe('citizen-token');
  });

  test('a real member gets the first organization set active', async () => {
    await expect(setupOrganization('member-token', baseUrl)).resolves.toBe(SET_COOKIE.split(';')[0]);
  });
});
