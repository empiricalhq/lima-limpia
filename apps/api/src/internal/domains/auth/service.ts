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
  adminPluginRoles: { [key in AppRole]: ReturnType<(typeof appAc)['newRole']> };
  emailService: EmailService;
}

export class AuthService {
  readonly auth;

  constructor({ config, db, accessControl, roles, adminPluginRoles, emailService }: AuthServiceDependencies) {
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
          // handler.ts's route allowlist is what actually keeps /organization/create
          // unreachable; this is defense in depth for the same reason (see ARCHITECTURE.md).
          // Only setup:admin (server-side, no session) and AdminService.createOrganizationUser
          // (addMember, not this endpoint) may create organizations or members.
          allowUserToCreateOrganization: false,
        }),
        admin({
          ac: accessControl,
          // Not `roles`: AdminService never calls this plugin's own endpoints over HTTP, and
          // `roles`'s `user`/`session` grants exist only for requirePermission's route-level
          // checks. handler.ts's route allowlist is what actually keeps set-role, create-user,
          // ban-user, impersonate-user, remove-user, and set-user-password unreachable; this is
          // defense in depth for the same reason (see ARCHITECTURE.md).
          roles: adminPluginRoles,
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
