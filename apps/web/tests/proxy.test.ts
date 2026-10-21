import { beforeAll, describe, expect, test } from 'bun:test';
import { NextRequest } from 'next/server';
import './fake-api';

const HTTP_OK = 200;
const HTTP_TEMPORARY_REDIRECT = 307;
const HTTP_SERVICE_UNAVAILABLE = 503;

describe('proxy', () => {
  let proxy: (request: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    // `lib/env.ts` reads API_BASE_URL at import time, so `proxy.ts` must load only after
    // `fake-api.ts` has pointed it at the shared fake API.
    ({ proxy } = await import('../src/proxy'));
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
