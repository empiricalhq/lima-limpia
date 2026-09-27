import { afterAll, describe, expect, test } from 'bun:test';
import { AdminService } from '@/internal/domains/admin/service';
import { AssignmentRepository } from '@/internal/domains/assignments/repository';
import { AuthService } from '@/internal/domains/auth/service';
import { IssueRepository } from '@/internal/domains/issues/repository';
import { RouteRepository } from '@/internal/domains/routes/repository';
import { TruckRepository } from '@/internal/domains/trucks/repository';
import { UserRepository } from '@/internal/domains/users/repository';
import { loadConfig } from '@/internal/shared/config/config';
import { Database } from '@/internal/shared/database/database';
import { EmailService } from '@/internal/shared/services/email';
import { ValidationError } from '@/internal/shared/utils/errors';

/**
 * A deleted organization can only reach `createStaffUser`'s membership insert if the caller's own
 * membership already outlived it, which can't happen through the live HTTP API: `member.organizationId`
 * cascades on delete, so the same delete that would produce this foreign-key failure also removes
 * the caller's own membership and gets refused by `requirePermission` first. Construct `AdminService`
 * directly, with the same real config, database, and better-auth instance `createContainer` wires up,
 * to reach the one caller (`createOrganizationUser`) this error can't reach through `admin.test.ts`'s
 * HTTP client.
 */
const config = loadConfig();
const db = new Database(config.database);
const authService = new AuthService({ config, db, emailService: new EmailService(config.email) });
const adminService = new AdminService({
  truckRepo: new TruckRepository(db),
  routeRepo: new RouteRepository(db),
  assignmentRepo: new AssignmentRepository(db),
  issueRepo: new IssueRepository(db),
  userRepo: new UserRepository(db),
  authService,
});

afterAll(async () => {
  await db.close();
});

describe('AdminService.createOrganizationUser error routing', () => {
  test('maps a foreign-key failure from a deleted organization instead of raising it as a 500', async () => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO organization (id, name, slug) VALUES (gen_random_uuid(), 'Deleted Org', $1) RETURNING id`,
      [`deleted-org-${Date.now()}`],
    );
    const organizationId = rows[0]?.id;
    if (!organizationId) {
      throw new Error('Failed to create the scratch organization.');
    }
    await db.query('DELETE FROM organization WHERE id = $1', [organizationId]);

    const email = `fk-check-${Date.now()}@test.com`;
    let caught: unknown;
    try {
      await adminService.createDriver(
        { name: 'Should Not Persist', email, password: 'created-password-123' },
        organizationId,
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as ValidationError).statusCode).toBe(400);

    const { rows: orphan } = await db.query('SELECT id FROM "user" WHERE email = $1', [email]);
    expect(orphan).toHaveLength(0);
  });
});
