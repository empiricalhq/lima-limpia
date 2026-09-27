import { betterAuth } from 'better-auth';
import { admin, organization } from 'better-auth/plugins';
import type { Pool } from 'pg';
import { appAc, appPluginRoles, disabledAdminPluginRoles } from './roles.ts';

export interface CreateAppAuthOptions {
  pool: Pool;
  secret: string;
  baseURL: string;
  trustedOrigins?: string[];
  sendResetPassword?: (data: { user: { email: string; name: string }; url: string }) => Promise<void>;
}

/**
 * The one Better Auth configuration every user-creating entry point uses: the API server, the
 * seed script, and the bootstrap-owner script. `admin`'s `roles` stays `disabledAdminPluginRoles`
 * everywhere, not just in the API: none of these callers ever call the admin plugin's endpoints
 * over HTTP with a caller's session, so no role needs a grant there (see ARCHITECTURE.md).
 */
export function createAppAuth(options: CreateAppAuthOptions) {
  return betterAuth({
    database: options.pool,
    secret: options.secret,
    // biome-ignore lint/style/useNamingConvention: Better Auth requires baseURL.
    baseURL: options.baseURL,
    trustedOrigins: options.trustedOrigins,
    emailAndPassword: {
      enabled: true,
      ...(options.sendResetPassword ? { sendResetPassword: options.sendResetPassword } : {}),
    },
    telemetry: { enabled: false },
    plugins: [
      organization({
        ac: appAc,
        roles: appPluginRoles,
        allowUserToCreateOrganization: false,
      }),
      admin({
        ac: appAc,
        roles: disabledAdminPluginRoles,
        defaultRole: 'citizen',
      }),
    ],
  });
}

export type AppAuth = ReturnType<typeof createAppAuth>;
