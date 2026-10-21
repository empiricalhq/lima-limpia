/**
 * `lib/env.ts` caches API_BASE_URL at import time and bun shares the module registry
 * across test files, so every test file must use this one fake API. Scenarios are named
 * by the session token: a real member, a real non-member or citizen, or an outage.
 */

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const HTTP_SERVICE_UNAVAILABLE = 503;
const SESSION_TOKEN_COOKIE_PATTERN = /better-auth\.session_token=([^;]+)/;
const TRAILING_SLASH_PATTERN = /\/$/;

export const SET_SESSION_COOKIE = 'better-auth.session_token=fake-session; Path=/; HttpOnly';

function scenario(request: Request): string {
  const cookie = request.headers.get('cookie') ?? '';
  return cookie.match(SESSION_TOKEN_COOKIE_PATTERN)?.[1] ?? cookie;
}

const server = Bun.serve({
  port: 0,
  fetch(request) {
    const url = new URL(request.url);
    const token = scenario(request);

    if (url.pathname === '/api/auth/get-session') {
      return Response.json({ session: { id: 'session-1' }, user: { id: 'user-1', role: 'user' } });
    }

    if (url.pathname === '/api/auth/organization/get-active-member-role') {
      if (token === 'owner-token') {
        return Response.json({ role: 'owner' });
      }
      if (token === 'non-member-token') {
        return Response.json({ code: 'NO_ACTIVE_ORGANIZATION' }, { status: HTTP_BAD_REQUEST });
      }
      // Anything else simulates the lookup itself failing (API down, database down, ...).
      return new Response('internal error', { status: HTTP_SERVICE_UNAVAILABLE });
    }

    if (url.pathname === '/api/auth/organization/list') {
      if (token === 'citizen-token') {
        return Response.json([]);
      }
      if (token === 'member-token') {
        return Response.json([{ id: 'org-1', name: 'Lima Garbage' }]);
      }
      return new Response('internal error', { status: HTTP_INTERNAL_SERVER_ERROR });
    }

    if (url.pathname === '/api/auth/organization/set-active') {
      return new Response(null, { headers: { 'Set-Cookie': SET_SESSION_COOKIE } });
    }

    return new Response('not found', { status: HTTP_NOT_FOUND });
  },
});

export const FAKE_API_BASE_URL = server.url.toString().replace(TRAILING_SLASH_PATTERN, '');

process.env.API_BASE_URL = FAKE_API_BASE_URL;
