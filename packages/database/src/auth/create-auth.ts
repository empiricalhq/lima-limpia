import { betterAuth } from 'better-auth';
import { admin, organization } from 'better-auth/plugins';
import type { Pool } from 'pg';
import {
  appAc,
  appPluginRoles,
  IMPERSONATION_SESSION_SECONDS,
  PlatformRoles,
  platformAdminPluginRoles,
} from './roles.ts';

export interface CreateAppAuthOptions {
  pool: Pool;
  secret: string;
  baseURL: string;
  trustedOrigins?: string[];
  sendResetPassword?: (data: { user: { email: string; name: string }; url: string }) => Promise<void>;
}

/**
 * The one Better Auth configuration every user-creating entry point uses: the API server, the
 * seed script, and the operator's setup scripts. `admin`'s `roles` is `platformAdminPluginRoles`
 * everywhere: only the support role holds a grant there, and only the API's support routes call
 * the plugin with a caller's session (see ARCHITECTURE.md).
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
        roles: platformAdminPluginRoles,
        adminRoles: [PlatformRoles.SUPPORT],
        defaultRole: 'citizen',
        impersonationSessionDuration: IMPERSONATION_SESSION_SECONDS,
      }),
    ],
  });
}

export type AppAuth = ReturnType<typeof createAppAuth>;
