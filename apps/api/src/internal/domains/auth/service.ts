import { betterAuth } from 'better-auth';
import { admin, organization } from 'better-auth/plugins';
import type { AppRole, appAc } from '@/internal/shared/auth/roles';
import type { Config } from '@/internal/shared/config/config';
import type { DatabaseInterface } from '@/internal/shared/database/database';
import type { EmailService } from '@/internal/shared/services/email';

interface AuthServiceDependencies {
  config: Config;
  db: DatabaseInterface;
  accessControl: typeof appAc;
  roles: { [key in AppRole]: ReturnType<(typeof appAc)['newRole']> };
  emailService: EmailService;
}

export class AuthService {
  readonly auth;

  constructor({ config, db, accessControl, roles, emailService }: AuthServiceDependencies) {
    this.auth = betterAuth({
      database: db.getPool(),
      secret: config.auth.secret,
      baseURL: config.auth.baseURL,
      trustedOrigins: config.auth.trustedOrigins,
      emailAndPassword: {
        enabled: true,
        sendResetPassword: async ({ user, url }) => {
          await emailService.sendPasswordResetEmail(user.email, url, user.name);
        },
      },
      plugins: [
        organization({
          ac: accessControl,
          roles,
        }),
        admin({
          ac: accessControl,
          roles,
          defaultRole: 'citizen',
        }),
      ],
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
