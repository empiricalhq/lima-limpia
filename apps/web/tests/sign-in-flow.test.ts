import { beforeAll, describe, expect, test } from 'bun:test';
import { FAKE_API_BASE_URL, SET_SESSION_COOKIE } from './fake-api';

describe('setupOrganization', () => {
  let setupOrganization: typeof import('../src/features/auth/sign-in-flow')['setupOrganization'];
  let VERIFICATION_FAILED_MESSAGE: string;

  beforeAll(async () => {
    // `lib/env.ts` reads API_BASE_URL at import time, so `sign-in-flow.ts` must load only after
    // `fake-api.ts` has pointed it at the shared fake API. The tests still pass the URL
    // explicitly so they target the fake regardless of what `env.ts` cached.
    ({ setupOrganization, VERIFICATION_FAILED_MESSAGE } = await import('../src/features/auth/sign-in-flow'));
  });

  test('an organization-list outage fails sign-in instead of falling through as no organization', async () => {
    await expect(setupOrganization('outage-token', FAKE_API_BASE_URL)).rejects.toThrow(VERIFICATION_FAILED_MESSAGE);
  });

  test('a real citizen (empty organization list) passes the session cookie through unchanged', async () => {
    await expect(setupOrganization('citizen-token', FAKE_API_BASE_URL)).resolves.toBe('citizen-token');
  });

  test('a real member gets the first organization set active', async () => {
    await expect(setupOrganization('member-token', FAKE_API_BASE_URL)).resolves.toBe(SET_SESSION_COOKIE.split(';')[0]);
  });
});
