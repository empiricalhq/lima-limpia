import { createAppAuth } from '@lima-garbage/database';
import type { Pool } from 'pg';
import type { Config } from '@/internal/shared/config/config';
import type { DatabaseInterface } from '@/internal/shared/database/database';
import type { EmailService } from '@/internal/shared/services/email';

interface AuthServiceDependencies {
  config: Config;
  db: DatabaseInterface;
  emailService: EmailService;
}

export class AuthService {
  readonly auth;
  readonly pool: Pool;

  constructor({ config, db, emailService }: AuthServiceDependencies) {
    this.pool = db.getPool();
    // handler.ts's route allowlist is what actually keeps every plugin-mounted endpoint other
    // than the ones it lists unreachable; createAppAuth's fixed roles are defense in depth for
    // the same reason (see ARCHITECTURE.md). The database package's bootstrap-owner script,
    // AdminService.createOrganizationUser, and the dev-only seed script are the only writers of
    // organization or member rows, and all three do it with a direct SQL insert in a transaction
    // (see `insertMember`), not through better-auth's `/organization/create` or
    // `/organization/add-member`.
    this.auth = createAppAuth({
      pool: this.pool,
      secret: config.auth.secret,
      baseURL: config.auth.baseURL,
      trustedOrigins: config.auth.trustedOrigins,
      sendResetPassword: async ({ user, url }) => {
        await emailService.sendPasswordResetEmail(user.email, url, user.name);
      },
    });
  }

  get handler() {
    return this.auth.handler;
  }

  get api() {
    return this.auth.api;
  }

  /** Hash with better-auth's own hasher so the stored value verifies at sign-in. */
  async hashPassword(password: string): Promise<string> {
    const context = await this.auth.$context;
    return context.password.hash(password);
  }
}
