import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { BaseTest } from './base-test';
import { HTTP_STATUS, TEST_USERS } from './config';

const REDIRECT_TO = 'http://localhost:3000/reset-password';
const TOKEN_PATTERN = /^reset-password:[A-Za-z0-9]+$/;

describe('Password reset', () => {
  const baseTest = new BaseTest();
  const { email } = TEST_USERS.citizen;

  beforeEach(async () => {
    await baseTest.setup();
  });

  afterAll(async () => {
    await baseTest.teardown();
  });

  async function requestResetToken(): Promise<{ token: string; verificationId: string }> {
    const requested = await baseTest.ctx.client.post('/auth/request-password-reset', {
      email,
      redirectTo: REDIRECT_TO,
    });
    expect(requested.status).toBe(HTTP_STATUS.OK);

    const rows = await baseTest.ctx.db.query<{ identifier: string; id: string }>(
      `SELECT identifier, id
       FROM verification
       WHERE value = (SELECT id FROM "user" WHERE email = $1) AND identifier LIKE $2
       ORDER BY "createdAt" DESC
       LIMIT 1`,
      [email, 'reset-password:%'],
    );
    const [row] = rows;
    if (!row?.identifier.match(TOKEN_PATTERN)) {
      throw new Error('reset verification row not found');
    }
    return { token: row.identifier.replace('reset-password:', ''), verificationId: row.id };
  }

  const resetPassword = (body: Record<string, unknown>) => baseTest.ctx.client.post('/auth/reset-password', body);

  test.each([
    ['a known email', TEST_USERS.citizen.email],
    ['an unknown email', 'nonexistent@example.com'],
  ])('requesting a reset for %s succeeds without disclosing which exists', async (_label, requestedEmail) => {
    const response = await baseTest.ctx.client.post('/auth/request-password-reset', {
      email: requestedEmail,
      redirectTo: REDIRECT_TO,
    });

    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(response.data).toHaveProperty('status', true);
  });

  test.each([
    ['a missing email', {}],
    ['a malformed email', { email: 'invalid-email' }],
  ])('requesting a reset with %s is refused', async (_label, body) => {
    const response = await baseTest.ctx.client.post('/auth/request-password-reset', {
      ...body,
      redirectTo: REDIRECT_TO,
    });

    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect((response.data as { code: string }).code).toBe('VALIDATION_ERROR');
  });

  test('a valid token resets the password and the new password signs in', async () => {
    const { token } = await requestResetToken();
    const newPassword = 'NewSecurePassword123!';

    const resetResponse = await resetPassword({ token, newPassword });

    expect(resetResponse.status).toBe(HTTP_STATUS.OK);
    expect(resetResponse.data).toEqual({ status: true });
    const loginResponse = await baseTest.ctx.client.post('/auth/sign-in/email', { email, password: newPassword });
    expect(loginResponse.status).toBe(HTTP_STATUS.OK);
    expect((loginResponse.data as { user: { email: string } }).user.email).toBe(email);
    expect((loginResponse.data as { token: string }).token).toBeDefined();
  });

  test('resetting to the current password succeeds', async () => {
    const { token } = await requestResetToken();

    const resetResponse = await resetPassword({ token, newPassword: TEST_USERS.citizen.password });

    expect(resetResponse.status).toBe(HTTP_STATUS.OK);
    expect(resetResponse.data).toEqual({ status: true });
    const loginResponse = await baseTest.ctx.client.post('/auth/sign-in/email', {
      email,
      password: TEST_USERS.citizen.password,
    });
    expect(loginResponse.status).toBe(HTTP_STATUS.OK);
  });

  test.each([
    ['an unknown token', { token: 'invalid-token', newPassword: 'NewPassword123!' }],
    ['no token', { newPassword: 'NewPassword123!' }],
  ])('a reset with %s is refused as an invalid token', async (_label, body) => {
    const response = await resetPassword(body);

    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect((response.data as { code: string }).code).toBe('INVALID_TOKEN');
  });

  test('a reset without a new password is refused', async () => {
    const response = await resetPassword({ token: 'some-token' });

    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect((response.data as { code: string }).code).toBe('VALIDATION_ERROR');
  });

  test('a new password shorter than the minimum is refused', async () => {
    const { token } = await requestResetToken();

    const response = await resetPassword({ token, newPassword: 'short' });

    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(response.data).toHaveProperty('code', 'PASSWORD_TOO_SHORT');
  });

  test('an expired token is refused', async () => {
    const { token, verificationId } = await requestResetToken();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await baseTest.ctx.db.query(`UPDATE verification SET "expiresAt" = $1 WHERE id = $2`, [oneHourAgo, verificationId]);

    const response = await resetPassword({ token, newPassword: 'NewPassword123!' });

    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect((response.data as { code: string }).code).toBe('INVALID_TOKEN');
  });

  test('a token expires an hour after it is issued', async () => {
    const { verificationId } = await requestResetToken();

    const [row] = await baseTest.ctx.db.query<{ createdAt: Date; expiresAt: Date }>(
      `SELECT "createdAt", "expiresAt" FROM verification WHERE id = $1`,
      [verificationId],
    );

    const ttlMs = new Date(row?.expiresAt ?? 0).getTime() - new Date(row?.createdAt ?? 0).getTime();
    expect(ttlMs).toBeGreaterThan(58 * 60 * 1000);
    expect(ttlMs).toBeLessThan(62 * 60 * 1000);
  });

  test('a token cannot be reused after a successful reset', async () => {
    const { token } = await requestResetToken();
    const first = await resetPassword({ token, newPassword: 'FirstNewPassword123!' });
    expect(first.status).toBe(HTTP_STATUS.OK);

    const second = await resetPassword({ token, newPassword: 'SecondNewPassword123!' });

    expect(second.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect((second.data as { code: string }).code).toBe('INVALID_TOKEN');
  });
});
