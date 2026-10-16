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
