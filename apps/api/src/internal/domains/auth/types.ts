import type { OrganizationScope } from '@/internal/shared/tenancy/scope';
import type { AuthService } from './service';

// Derived from the configured AuthService instance, not a bare `betterAuth` call: the latter
// resolves generic defaults with no plugins applied, silently dropping org-plugin session fields
// like `activeOrganizationId`.
export type AuthUser = AuthService['auth']['$Infer']['Session']['user'];
export type AuthSession = AuthService['auth']['$Infer']['Session']['session'];

export interface AuthEnv {
  Variables: {
    user: AuthUser;
    session: AuthSession;
    /** The support user acting as `user`, or null when `user` signed in themselves. */
    impersonatedBy: string | null;
  };
}

/** Routes behind the staff middlewares, which set the caller's municipality as `scope`. */
export interface StaffEnv {
  Variables: AuthEnv['Variables'] & {
    scope: OrganizationScope;
  };
}
