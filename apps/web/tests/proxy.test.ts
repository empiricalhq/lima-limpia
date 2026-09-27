import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { NextRequest } from 'next/server';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_TEMPORARY_REDIRECT = 307;
const HTTP_SERVICE_UNAVAILABLE = 503;
const SESSION_TOKEN_COOKIE_PATTERN = /better-auth\.session_token=([^;]+)/;
const TRAILING_SLASH_PATTERN = /\/$/;

/**
 * The fake API tells scenarios apart by the session token itself, so one server can answer
 * `get-session` (always a valid session) and `get-active-member-role` differently per test:
 * a real member, a real non-member (400, `NO_ACTIVE_ORGANIZATION`), and an outage (503).
 */
function startFakeApi() {
  return Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      const scenario = request.headers.get('cookie')?.match(SESSION_TOKEN_COOKIE_PATTERN)?.[1];

      if (url.pathname === '/api/auth/get-session') {
        return Response.json({ session: { id: 'session-1' }, user: { id: 'user-1', role: 'user' } });
      }

      if (url.pathname === '/api/auth/organization/get-active-member-role') {
        if (scenario === 'owner-token') {
          return Response.json({ role: 'owner' });
        }
        if (scenario === 'non-member-token') {
          return Response.json({ code: 'NO_ACTIVE_ORGANIZATION' }, { status: HTTP_BAD_REQUEST });
        }
        // Anything else simulates the lookup itself failing (API down, database down, ...).
        return new Response('internal error', { status: HTTP_SERVICE_UNAVAILABLE });
      }

      return new Response('not found', { status: 404 });
    },
  });
}

describe('proxy', () => {
  let server: ReturnType<typeof startFakeApi>;
  let proxy: (request: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    server = startFakeApi();
    // `lib/env.ts` reads API_BASE_URL at import time, so it must be set before `proxy.ts` loads.
    process.env.API_BASE_URL = server.url.toString().replace(TRAILING_SLASH_PATTERN, '');
    ({ proxy } = await import('../src/proxy'));
  });

  afterAll(() => {
    server.stop(true);
  });

  function requestDashboard(sessionToken: string): Promise<Response> {
    const request = new NextRequest('http://localhost:3100/dashboard');
    request.cookies.set('better-auth.session_token', sessionToken);
    return proxy(request);
  }

  test('a real non-member is redirected to sign-in and loses the session cookie', async () => {
    const response = await requestDashboard('non-member-token');

    expect(response.status).toBe(HTTP_TEMPORARY_REDIRECT);
    expect(response.headers.get('location')).toContain('/signin');
    expect(response.headers.get('set-cookie')).toContain('better-auth.session_token=;');
  });

  test('a member-role lookup failure fails the request but keeps the session cookie', async () => {
    const response = await requestDashboard('outage-token');

    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  test('a real owner passes through unaffected', async () => {
    const response = await requestDashboard('owner-token');

    expect(response.status).toBe(HTTP_OK);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
